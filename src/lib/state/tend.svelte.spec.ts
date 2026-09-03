import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTINE_TEMPLATES } from '$lib/domain/exercise-catalog';
import { logFromFood } from '$lib/domain/log-entry';
import { emptyProfile } from '$lib/domain/profile';
import { RECIPE_BY_ID, RECIPES, recipeFits } from '$lib/domain/recipes';
import type {
	Injection,
	LogItem,
	LogSource,
	Meal,
	PlannedMeal,
	Profile,
	TendState
} from '$lib/domain/types';
import { PLANNED_MEALS, REST_WEEK, ZERO_MICROS } from '$lib/domain/types';
import { todayISO } from '$lib/domain/utils';
import { countsAsTraining } from '$lib/domain/workout';
import { STORAGE_KEY, TendStore } from './tend.svelte';

function freshStore() {
	localStorage.clear();
	const store = new TendStore();
	store.hydrate();
	return store;
}

/**
 * Log one catalog food. The store carried this shorthand until nothing in the
 * app turned out to use it; the tests that lean on it keep it here instead.
 */
function logFood(
	store: TendStore,
	args: { foodId: string; servings: number; meal: Meal; date?: string; source?: LogSource }
) {
	store.addLogItems([
		logFromFood({ ...args, date: args.date ?? todayISO(), source: args.source ?? 'manual' })
	]);
}

/**
 * Say whether the tab is on screen. `visibilityState` is read-only on a real
 * document, so the test defines it rather than assigning to it.
 */
function setVisibility(state: DocumentVisibilityState) {
	Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

/** Put a known plan in place, so a swap has something predictable to move. */
function setPlan(store: TendStore, plan: PlannedMeal[]) {
	store.state.weekPlan = plan;
	store.persist();
}

function onboarded(overrides: Partial<Profile> = {}) {
	const store = freshStore();
	store.completeOnboarding({
		profile: { ...emptyProfile({ name: 'Alex' }), ...overrides },
		household: false,
		useSample: false
	});
	return store;
}

/**
 * The persisted payload, read back through the literal key rather than the
 * exported constant: a build that renamed the key would still round-trip
 * against itself, and every already-installed copy of the app would silently
 * lose its data.
 */
function stored(): TendState {
	const raw = localStorage.getItem('tend.v1');
	if (raw === null) throw new Error('nothing was written to localStorage');
	return JSON.parse(raw) as TendState;
}

/** A second store over the same storage, standing in for a page reload. */
function reloaded() {
	const store = new TendStore();
	store.hydrate();
	return store;
}

/** A free-text entry: no `foodId`, so it can only ever be scaled by ratio. */
function customEntry(overrides: Partial<LogItem> = {}): LogItem {
	return {
		id: 'custom',
		foodId: null,
		date: todayISO(),
		meal: 'lunch',
		servings: 2,
		source: 'manual',
		name: 'Leftovers',
		kcal: 400,
		protein: 20,
		carbs: 40,
		fat: 15,
		micros: { ...ZERO_MICROS, fiber: 4 },
		servingLabel: 'plate',
		...overrides
	};
}

const dose: Omit<Injection, 'id'> = {
	date: '2026-06-01',
	medication: 'semaglutide',
	doseMg: 0.5,
	site: 'abdomen',
	appetite: 3,
	sideEffects: [],
	notes: ''
};

beforeEach(() => localStorage.clear());

describe('hydration', () => {
	it('starts empty when there is nothing stored', () => {
		const store = freshStore();
		expect(store.state.onboarded).toBe(false);
		expect(store.state.activeProfileId).toBe('');
		expect(store.state.profiles).toEqual([]);
		expect(store.state.weekPlan).toEqual([]);
		expect(store.state.pantry).toEqual([]);
		expect(store.hydrated).toBe(true);
	});

	it('restores a previously persisted state', () => {
		const first = onboarded();
		const second = reloaded();
		expect(second.state.profiles).toHaveLength(first.state.profiles.length);
		expect(second.state.activeProfileId).toBe(first.state.activeProfileId);
	});

	it('leaves what is already in memory alone when there is nothing stored', () => {
		const store = new TendStore();
		store.addProfile(emptyProfile({ name: 'Alex' }));
		store.hydrate();
		expect(store.state.profiles).toHaveLength(1);
	});

	it('starts clean rather than throwing on a corrupt payload', () => {
		localStorage.setItem(STORAGE_KEY, '{not json');
		const store = new TendStore();
		store.addProfile(emptyProfile({ name: 'Alex' }));
		store.hydrate();
		expect(store.state.onboarded).toBe(false);
		expect(store.state.profiles).toEqual([]);
	});

	it('fills in keys missing from an older payload', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ onboarded: true }));
		const store = new TendStore();
		store.hydrate();
		expect(store.state.pantry).toEqual([]);
		expect(store.state.weekPlan).toEqual([]);
		expect(store.state.activeProfileId).toBe('');
	});

	// A payload written before the units and the rest length were settings at
	// all: those keys are absent, and a session opened on `undefined` seconds
	// would count down from NaN.
	it('gives an older payload the default unit and rest length', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ onboarded: true, workouts: [] }));
		const store = new TendStore();
		store.hydrate();
		expect(store.state.loadUnit).toBe('kg');
		expect(store.state.restSeconds).toBe(90);
	});

	it('does not re-read storage once hydrated', () => {
		const store = freshStore();
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ onboarded: true }));
		store.hydrate();
		expect(store.state.onboarded).toBe(false);
	});
});

describe('onboarding', () => {
	it('marks the app as onboarded', () => {
		const store = onboarded();
		expect(store.state.onboarded).toBe(true);
		expect(store.state.profiles).toHaveLength(1);
	});

	it('makes the new profile active', () => {
		const store = onboarded();
		expect(store.profile?.name).toBe('Alex');
		expect(store.state.activeProfileId).toBe(store.state.profiles[0]?.id);
	});

	it('builds a week of meals', () => {
		expect(onboarded().state.weekPlan.length).toBeGreaterThan(0);
	});

	it('adds a second person when a household is requested', () => {
		const store = freshStore();
		store.completeOnboarding({
			profile: emptyProfile({ name: 'Alex' }),
			household: true,
			useSample: false
		});
		expect(store.state.profiles).toHaveLength(2);
		expect(store.state.profiles[1]?.name).toBe('Jordan');
		expect(store.state.profiles[1]?.restrictions).toEqual(['vegetarian']);
	});

	it('plans every slot for everyone in the household', () => {
		const store = freshStore();
		store.completeOnboarding({
			profile: emptyProfile({ name: 'Alex' }),
			household: true,
			useSample: false
		});
		const ids = store.state.profiles.map((p) => p.id);
		expect(ids).toHaveLength(2);
		for (const slot of store.state.weekPlan) {
			expect(slot.forProfileIds).toEqual(ids);
		}
	});

	it('seeds a lived-in log when the sample journal is chosen', () => {
		const store = freshStore();
		store.completeOnboarding({
			profile: emptyProfile({ name: 'Alex' }),
			household: false,
			useSample: true
		});
		expect(store.profile?.log.length).toBeGreaterThan(0);
		expect(store.state.profiles).toHaveLength(1);
	});

	it('keeps the entered name over the sample profile name', () => {
		const store = freshStore();
		store.completeOnboarding({
			profile: emptyProfile({ name: 'Robin' }),
			household: false,
			useSample: true
		});
		expect(store.profile?.name).toBe('Robin');
	});

	it('falls back to the sample profile name when none was entered', () => {
		const store = freshStore();
		store.completeOnboarding({
			profile: emptyProfile({ name: '' }),
			household: false,
			useSample: true
		});
		expect(store.profile?.name).toBe('Alex');
	});
});

describe('the log', () => {
	it('adds an entry for the active profile', () => {
		const store = onboarded();
		logFood(store, { foodId: 'egg-large', servings: 2, meal: 'breakfast' });
		expect(store.profile?.log).toHaveLength(1);
		expect(store.profile?.log[0]?.kcal).toBe(144);
		expect(store.profile?.log[0]?.protein).toBe(12.6);
	});

	it('dates a new entry today by default', () => {
		const store = onboarded();
		logFood(store, { foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		expect(store.profile?.log[0]?.date).toBe(todayISO());
	});

	it('calls an entry manual when nothing else said where it came from', () => {
		const store = onboarded();
		logFood(store, { foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		expect(store.profile?.log[0]?.source).toBe('manual');
	});

	it('keeps the source an entry was logged with', () => {
		const store = onboarded();
		logFood(store, { foodId: 'egg-large', servings: 1, meal: 'breakfast', source: 'photo' });
		expect(store.profile?.log[0]?.source).toBe('photo');
	});

	it('re-derives a catalog entry from its food when the servings change', () => {
		const store = onboarded();
		logFood(store, { foodId: 'egg-large', servings: 0.5, meal: 'breakfast' });
		const id = store.profile?.log[0]?.id ?? '';
		expect(store.profile?.log[0]?.protein).toBe(3.2);
		store.updateLog(id, { servings: 2 });
		const after = store.profile?.log[0];
		// Scaling the half-serving entry by ratio would land on 12.8 protein and
		// 1.6 iron; these are the numbers only the source food can produce.
		expect(after?.servings).toBe(2);
		expect(after?.kcal).toBe(144);
		expect(after?.protein).toBe(12.6);
		expect(after?.fat).toBe(9.6);
		expect(after?.micros.iron).toBe(1.8);
		expect(after?.micros.zinc).toBe(1.3);
	});

	it('scales a custom entry by ratio when it has no catalog food behind it', () => {
		const store = onboarded();
		store.addLogItems([customEntry()]);
		// Two servings to three: the ratio is 1.5, not 2 * 3, and not 1 — which
		// is what applying the patch before rescaling would produce.
		store.updateLog('custom', { servings: 3 });
		const after = store.profile?.log[0];
		expect(after?.servings).toBe(3);
		expect(after?.kcal).toBe(600);
		expect(after?.protein).toBe(30);
		expect(after?.carbs).toBe(60);
		expect(after?.fat).toBe(22.5);
		expect(after?.micros.fiber).toBe(6);
	});

	it('leaves a custom entry logged at zero servings where it is', () => {
		const store = onboarded();
		store.addLogItems([customEntry({ servings: 0 })]);
		store.updateLog('custom', { servings: 2 });
		const after = store.profile?.log[0];
		expect(after?.servings).toBe(2);
		expect(after?.kcal).toBe(400);
		expect(after?.protein).toBe(20);
	});

	it('leaves other fields alone when patching without a serving change', () => {
		const store = onboarded();
		logFood(store, { foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		const id = store.profile?.log[0]?.id ?? '';
		store.updateLog(id, { note: 'runny' });
		const after = store.profile?.log[0];
		expect(after?.note).toBe('runny');
		expect(after?.servings).toBe(1);
		expect(after?.kcal).toBe(72);
	});

	it('does not re-derive an edited entry when the serving count is unchanged', () => {
		const store = onboarded();
		logFood(store, { foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		const id = store.profile?.log[0]?.id ?? '';
		store.updateLog(id, { kcal: 999 });
		store.updateLog(id, { servings: 1, note: 'as weighed' });
		const after = store.profile?.log[0];
		expect(after?.kcal).toBe(999);
		expect(after?.note).toBe('as weighed');
	});

	it('removes only the entry it was asked for', () => {
		const store = onboarded();
		logFood(store, { foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		logFood(store, { foodId: 'egg-large', servings: 2, meal: 'lunch' });
		const first = store.profile?.log[0]?.id ?? '';
		store.removeLog(first);
		expect(store.profile?.log).toHaveLength(1);
		expect(store.profile?.log[0]?.meal).toBe('lunch');
	});

	it('ignores a log write when no profile is active', () => {
		const store = freshStore();
		store.addLogItems([customEntry()]);
		expect(store.profile).toBeNull();
		expect(localStorage.getItem('tend.v1')).toBeNull();
	});
});

describe('weigh-ins', () => {
	it('records a reading', () => {
		const store = onboarded();
		store.addWeight(80);
		expect(store.profile?.weights).toHaveLength(1);
		expect(store.profile?.weights[0]?.kg).toBe(80);
		expect(store.profile?.weights[0]?.id.startsWith('w-')).toBe(true);
	});

	it('replaces rather than appends a second reading on the same day', () => {
		const store = onboarded();
		store.addWeight(80);
		store.addWeight(79.5);
		expect(store.profile?.weights).toHaveLength(1);
		expect(store.profile?.weights[0]?.kg).toBe(79.5);
	});

	it('keeps readings in date order', () => {
		const store = onboarded();
		store.addWeight(80, '2026-06-02');
		store.addWeight(81, '2026-06-01');
		expect(store.profile?.weights.map((w) => w.date)).toEqual(['2026-06-01', '2026-06-02']);
	});
});

describe('injections', () => {
	it('records a dose', () => {
		const store = onboarded();
		store.addInjection(dose);
		expect(store.profile?.injections).toHaveLength(1);
		expect(store.profile?.injections[0]?.doseMg).toBe(0.5);
		expect(store.profile?.injections[0]?.id.startsWith('i-')).toBe(true);
	});

	it('switches the active profile', () => {
		const store = onboarded();
		const other = emptyProfile({ name: 'Jordan' });
		store.addProfile(other);
		store.setActive(other.id);
		expect(store.profile?.name).toBe('Jordan');
	});

	it('patches only the active profile', () => {
		const store = onboarded();
		const other = emptyProfile({ name: 'Jordan' });
		store.addProfile(other);
		store.patchActive((p) => ({ ...p, glp1: true }));
		expect(store.profile?.glp1).toBe(true);
		expect(store.state.profiles.find((p) => p.id === other.id)?.glp1).toBe(false);
	});
});

describe('the week plan', () => {
	it('fills three meals for each of seven days', () => {
		expect(onboarded().state.weekPlan).toHaveLength(21);
	});

	it('only plans recipes that exist', () => {
		for (const slot of onboarded().state.weekPlan) {
			expect(RECIPE_BY_ID[slot.recipeId]).toBeDefined();
		}
	});

	it('matches each slot to its own meal', () => {
		for (const slot of onboarded().state.weekPlan) {
			expect(RECIPE_BY_ID[slot.recipeId]?.meal).toBe(slot.meal);
		}
	});

	it('uses every recipe a meal offers before repeating one', () => {
		const store = onboarded();
		for (const meal of PLANNED_MEALS) {
			const chosen = new Set(
				store.state.weekPlan.filter((p) => p.meal === meal).map((p) => p.recipeId)
			);
			const available = RECIPES.filter((r) => r.meal === meal).length;
			expect(chosen.size).toBe(Math.min(7, available));
		}
	});

	it('honours a household restriction', () => {
		const store = onboarded({ restrictions: ['vegetarian'] });
		for (const slot of store.state.weekPlan) {
			expect(RECIPE_BY_ID[slot.recipeId]?.suits).toContain('vegetarian');
		}
	});

	it('treats one member on a GLP-1 as a protein floor for the household', () => {
		const store = onboarded({ glp1: true });
		store.addProfile(emptyProfile({ name: 'Jordan' }));
		store.generatePlan();
		expect(store.state.weekPlan).toHaveLength(21);
		for (const slot of store.state.weekPlan) {
			expect(RECIPE_BY_ID[slot.recipeId]?.suits).toContain('high-protein');
		}
	});

	it('bends a restriction rather than leaving a meal unplanned', () => {
		// Nothing on the breakfast menu is vegan, so those slots fall back to the
		// full breakfast list while lunch and dinner still hold the line.
		const store = onboarded({ restrictions: ['vegan'] });
		const plan = store.state.weekPlan;
		expect(plan).toHaveLength(21);
		const breakfasts = plan.filter((p) => p.meal === 'breakfast');
		expect(breakfasts).toHaveLength(7);
		for (const slot of breakfasts) {
			expect(RECIPE_BY_ID[slot.recipeId]?.meal).toBe('breakfast');
		}
		expect(new Set(breakfasts.map((p) => p.recipeId)).size).toBeGreaterThan(1);
		for (const slot of plan.filter((p) => p.meal !== 'breakfast')) {
			expect(RECIPE_BY_ID[slot.recipeId]?.suits).toContain('vegan');
		}
	});

	it('steps the slot it was asked for on to the next recipe in the pool', () => {
		const store = onboarded();
		const dinners = RECIPES.filter((r) => r.meal === 'dinner');
		const breakfast = RECIPES.filter((r) => r.meal === 'breakfast')[0]?.id ?? '';
		// Another day's dinner comes first and the same day's breakfast comes in
		// between, so matching on only half of date-and-meal picks the wrong slot.
		setPlan(store, [
			{ date: '2026-06-02', meal: 'dinner', recipeId: dinners[0]?.id ?? '', forProfileIds: [] },
			{ date: '2026-06-01', meal: 'breakfast', recipeId: breakfast, forProfileIds: [] },
			{ date: '2026-06-01', meal: 'dinner', recipeId: dinners[1]?.id ?? '', forProfileIds: [] }
		]);
		store.swapPlanned('2026-06-01', 'dinner');
		expect(store.state.weekPlan[2]?.recipeId).toBe(dinners[2]?.id);
		expect(store.state.weekPlan[0]?.recipeId).toBe(dinners[0]?.id);
		expect(store.state.weekPlan[1]?.recipeId).toBe(breakfast);
	});

	it('swaps within the recipes the household can still eat', () => {
		const store = onboarded({ restrictions: ['vegetarian'] });
		const fits = RECIPES.filter((r) => r.meal === 'dinner' && recipeFits(r, ['vegetarian']));
		expect(fits.length).toBeGreaterThan(1);
		setPlan(store, [
			{ date: '2026-06-01', meal: 'dinner', recipeId: fits[0]?.id ?? '', forProfileIds: [] }
		]);
		store.swapPlanned('2026-06-01', 'dinner');
		expect(store.state.weekPlan[0]?.recipeId).toBe(fits[1]?.id);
	});

	it('adds a food', () => {
		const store = onboarded();
		store.togglePantry('egg-large');
		expect(store.state.pantry).toContain('egg-large');
	});

	it('removes only the food toggled off', () => {
		const store = onboarded();
		store.togglePantry('egg-large');
		store.togglePantry('oats');
		store.togglePantry('egg-large');
		expect(store.state.pantry).toEqual(['oats']);
	});
});

describe('whole-state operations', () => {
	it('clears everything on reset', () => {
		const store = onboarded();
		store.resetAll();
		expect(store.state.onboarded).toBe(false);
		expect(store.state.profiles).toEqual([]);
		expect(store.state.activeProfileId).toBe('');
		expect(store.state.weekPlan).toEqual([]);
	});

	it('clears persisted storage on reset', () => {
		const store = onboarded();
		store.resetAll();
		expect(reloaded().state.onboarded).toBe(false);
	});

	it('writes the payload under the key an older build would read', () => {
		onboarded();
		expect(localStorage.getItem('tend.v1')).not.toBeNull();
		expect(stored().onboarded).toBe(true);
		expect(stored().profiles[0]?.name).toBe('Alex');
	});

	it('saves each change to the log as it is made', () => {
		const store = onboarded();
		logFood(store, { foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		expect(stored().profiles[0]?.log).toHaveLength(1);
		const id = store.profile?.log[0]?.id ?? '';
		store.updateLog(id, { servings: 2 });
		expect(stored().profiles[0]?.log[0]?.kcal).toBe(144);
		store.removeLog(id);
		expect(stored().profiles[0]?.log).toEqual([]);
	});

	it('saves measurements as they are recorded', () => {
		const store = onboarded();
		store.addWeight(80);
		expect(stored().profiles[0]?.weights[0]?.kg).toBe(80);
		store.addInjection(dose);
		expect(stored().profiles[0]?.injections).toHaveLength(1);
	});

	it('saves each change to the profile list as it is made', () => {
		const store = onboarded();
		const other = emptyProfile({ name: 'Jordan' });
		store.addProfile(other);
		expect(stored().profiles).toHaveLength(2);
		store.setActive(other.id);
		expect(stored().activeProfileId).toBe(other.id);
		store.patchActive((p) => ({ ...p, glp1: true }));
		expect(stored().profiles[1]?.glp1).toBe(true);
	});

	it('saves each change to the plan and the pantry as it is made', () => {
		const store = onboarded();
		const dinners = RECIPES.filter((r) => r.meal === 'dinner');
		setPlan(store, [
			{ date: '2026-06-01', meal: 'dinner', recipeId: dinners[0]?.id ?? '', forProfileIds: [] }
		]);
		expect(stored().weekPlan).toHaveLength(1);
		store.swapPlanned('2026-06-01', 'dinner');
		expect(stored().weekPlan[0]?.recipeId).toBe(dinners[1]?.id);
		store.togglePantry('egg-large');
		expect(stored().pantry).toEqual(['egg-large']);
		store.generatePlan();
		expect(stored().weekPlan).toHaveLength(21);
	});

	it('does not write anything before the store is hydrated', () => {
		const store = new TendStore();
		store.addProfile(emptyProfile({ name: 'Alex' }));
		expect(store.state.profiles).toHaveLength(1);
		expect(localStorage.getItem('tend.v1')).toBeNull();
	});

	it('neither reads nor writes where there is no localStorage at all', () => {
		// The store is constructed at import time and a server render reaches
		// `hydrate()` before any browser storage exists.
		const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
		Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
		try {
			const store = new TendStore();
			store.hydrate();
			store.addProfile(emptyProfile({ name: 'Alex' }));
			expect(store.hydrated).toBe(true);
			expect(store.state.profiles).toHaveLength(1);
		} finally {
			if (real) Object.defineProperty(globalThis, 'localStorage', real);
		}
	});

	it('reloads into the state it wrote', () => {
		const store = onboarded();
		logFood(store, { foodId: 'egg-large', servings: 2, meal: 'breakfast' });
		store.addWeight(80);
		store.togglePantry('oats');
		const next = reloaded();
		expect(next.state.activeProfileId).toBe(store.state.activeProfileId);
		expect(next.state.profiles[0]?.log[0]?.kcal).toBe(144);
		expect(next.state.profiles[0]?.weights[0]?.kg).toBe(80);
		expect(next.state.pantry).toEqual(['oats']);
		expect(next.state.weekPlan).toHaveLength(21);
	});
});

describe('guards when nothing is active', () => {
	it('ignores a serving change', () => {
		const store = freshStore();
		store.updateLog('nope', { servings: 2 });
		expect(store.profile).toBeNull();
		expect(localStorage.getItem('tend.v1')).toBeNull();
	});

	it('ignores a removal', () => {
		const store = freshStore();
		store.removeLog('nope');
		expect(store.profile).toBeNull();
		expect(localStorage.getItem('tend.v1')).toBeNull();
	});

	it('ignores a weigh-in', () => {
		const store = freshStore();
		store.addWeight(80);
		expect(store.profile).toBeNull();
		expect(localStorage.getItem('tend.v1')).toBeNull();
	});

	it('ignores a dose', () => {
		const store = freshStore();
		store.addInjection(dose);
		expect(store.profile).toBeNull();
		expect(localStorage.getItem('tend.v1')).toBeNull();
	});

	it('leaves unrelated entries untouched when patching', () => {
		const store = onboarded();
		logFood(store, { foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		store.updateLog('not-this-one', { servings: 5 });
		expect(store.profile?.log[0]?.servings).toBe(1);
		expect(store.profile?.log[0]?.kcal).toBe(72);
	});
});

describe('the sample household', () => {
	it('adds the second sample profile', () => {
		const store = freshStore();
		store.completeOnboarding({
			profile: emptyProfile({ name: 'Alex' }),
			household: true,
			useSample: true
		});
		expect(store.state.profiles).toHaveLength(2);
	});

	it('carries an entered weight into an empty start', () => {
		const store = freshStore();
		store.completeOnboarding({
			profile: {
				...emptyProfile({ name: 'Alex' }),
				weights: [{ id: 'w', date: '2026-06-01', kg: 72 }]
			},
			household: false,
			useSample: false
		});
		expect(store.profile?.weights[0]?.kg).toBe(72);
	});

	it('plans a week that suits every member of a mixed household', () => {
		const store = freshStore();
		store.completeOnboarding({
			profile: { ...emptyProfile({ name: 'Alex' }), restrictions: ['vegan'] },
			household: true,
			useSample: false
		});
		expect(store.state.weekPlan.length).toBeGreaterThan(0);
		for (const slot of store.state.weekPlan.filter((p) => p.meal !== 'breakfast')) {
			expect(RECIPE_BY_ID[slot.recipeId]?.suits).toContain('vegan');
		}
	});

	it('still plans a week for an impossible set of restrictions', () => {
		const store = freshStore();
		store.completeOnboarding({
			profile: {
				...emptyProfile({ name: 'Alex' }),
				restrictions: ['vegan', 'nut-free', 'gluten-free', 'low-sodium', 'high-protein']
			},
			household: false,
			useSample: false
		});
		expect(store.state.weekPlan).toHaveLength(21);
	});

	it('raises protein for a GLP-1 household', () => {
		const store = freshStore();
		store.completeOnboarding({
			profile: { ...emptyProfile({ name: 'Alex' }), glp1: true, goal: 'glp1' },
			household: false,
			useSample: false
		});
		expect(store.state.weekPlan).toHaveLength(21);
		for (const slot of store.state.weekPlan) {
			expect(RECIPE_BY_ID[slot.recipeId]?.suits).toContain('high-protein');
		}
	});

	it('leaves a slot alone when there is nothing to swap it for', () => {
		const store = onboarded();
		const before = [...store.state.weekPlan];
		store.swapPlanned('1999-01-01', 'dinner');
		expect(store.state.weekPlan).toHaveLength(before.length);
		expect(store.state.weekPlan.map((p) => p.recipeId)).toEqual(before.map((p) => p.recipeId));
	});
});

/** A store holding the single-routine starter template, which is the smallest real routine. */
function withRoutine() {
	const store = freshStore();
	store.useTemplate('fb');
	return store;
}

/** The same, with a session already open on it. */
function inSession() {
	const store = withRoutine();
	store.startWorkout('full-body');
	return store;
}

function template(id: string) {
	const found = ROUTINE_TEMPLATES.find((t) => t.id === id);
	if (!found) throw new Error(`test fixture references unknown template: ${id}`);
	return found;
}

describe('starting from a template', () => {
	it('takes the routines the template ships', () => {
		const store = withRoutine();
		expect(store.state.routines).toHaveLength(1);
		expect(store.state.routines[0]?.id).toBe('full-body');
		expect(store.state.routines[0]?.name).toBe('Full body');
		expect(store.state.routines[0]?.exercises.map((e) => e.name)).toEqual(
			template('fb').routines[0]?.exercises.map((e) => e.name)
		);
	});

	it('takes a plan with it, so the calendar is not empty on day one', () => {
		const store = withRoutine();
		expect(store.state.trainingPlan.length).toBeGreaterThan(0);
		for (const week of store.state.trainingPlan) {
			expect(['full-body', REST_WEEK]).toContain(week.routineId);
		}
	});

	it('plans every routine of a rotation, not just the first', () => {
		const store = freshStore();
		store.useTemplate('ppl');
		expect(store.state.routines.map((r) => r.id)).toEqual(['push', 'pull', 'legs']);
		const planned = new Set(store.state.trainingPlan.map((p) => p.routineId));
		expect(planned.has('pull')).toBe(true);
	});

	it('takes nothing from a template it has never heard of', () => {
		const store = freshStore();
		store.useTemplate('nope');
		expect(store.state.routines).toEqual([]);
		expect(store.state.trainingPlan).toEqual([]);
		expect(localStorage.getItem('tend.v1')).toBeNull();
	});

	it('replaces an earlier choice rather than adding to it', () => {
		const store = freshStore();
		store.useTemplate('ppl');
		store.useTemplate('fb');
		expect(store.state.routines).toHaveLength(1);
		expect(store.state.trainingPlan.every((p) => p.routineId !== 'push')).toBe(true);
	});

	it('leaves the shipped template alone when the copy is edited', () => {
		const store = withRoutine();
		const before = template('fb').routines[0]?.exercises[0]?.load;
		store.bumpRoutineExercise('full-body', 0, 'load', 1);
		expect(store.state.routines[0]?.exercises[0]?.load).toBe((before ?? 0) + 2.5);
		expect(template('fb').routines[0]?.exercises[0]?.load).toBe(before);
	});

	it('saves the routines and the plan as it takes them', () => {
		withRoutine();
		expect(stored().routines).toHaveLength(1);
		expect(stored().trainingPlan.length).toBeGreaterThan(0);
	});
});

describe('routines', () => {
	it('opens a new routine and hands it back', () => {
		const store = freshStore();
		const routine = store.createRoutine();
		expect(routine.name).toBe('New routine');
		expect(routine.id.startsWith('r-')).toBe(true);
		expect(store.state.routines).toHaveLength(1);
		expect(store.routine(routine.id)).toBeDefined();
	});

	it('has no routine to hand back under an id nobody used', () => {
		expect(freshStore().routine('nope')).toBeUndefined();
	});

	it('renames a routine and changes how often it runs', () => {
		const store = withRoutine();
		store.updateRoutine('full-body', { name: 'Everything', freq: 4 });
		expect(store.routine('full-body')?.name).toBe('Everything');
		expect(store.routine('full-body')?.freq).toBe(4);
	});

	it('leaves the other routines alone when one is renamed', () => {
		const store = freshStore();
		store.useTemplate('ppl');
		store.updateRoutine('pull', { name: 'Back day' });
		expect(store.routine('push')?.name).toBe('Chest & Shoulders');
		expect(store.routine('pull')?.name).toBe('Back day');
	});

	it('removes the routine it was asked for', () => {
		const store = freshStore();
		store.useTemplate('ppl');
		store.removeRoutine('pull');
		expect(store.state.routines.map((r) => r.id)).toEqual(['push', 'legs']);
	});

	it('clears the weeks that pointed at a routine it removed', () => {
		const store = freshStore();
		store.useTemplate('ppl');
		store.planWeeks(2026, [1, 2], 'pull');
		store.planWeeks(2026, [3], 'legs');
		store.removeRoutine('pull');
		expect(store.state.trainingPlan.some((p) => p.routineId === 'pull')).toBe(false);
		expect(store.state.trainingPlan).toContainEqual({ year: 2026, week: 3, routineId: 'legs' });
	});

	it('saves each change to the routine list as it is made', () => {
		const store = freshStore();
		const routine = store.createRoutine();
		expect(stored().routines).toHaveLength(1);
		store.updateRoutine(routine.id, { name: 'Everything' });
		expect(stored().routines[0]?.name).toBe('Everything');
		store.removeRoutine(routine.id);
		expect(stored().routines).toEqual([]);
	});
});

describe('the movements in a routine', () => {
	it('adds a library movement at three sets of ten, at bodyweight', () => {
		const store = freshStore();
		const routine = store.createRoutine();
		store.addExercises(routine.id, ['Deadlift']);
		expect(store.routine(routine.id)?.exercises).toEqual([
			{ name: 'Deadlift', group: 'Legs', sets: 3, reps: 10, load: 0 }
		]);
	});

	it('adds to the end rather than to the front', () => {
		const store = withRoutine();
		store.addExercises('full-body', ['Deadlift']);
		expect(store.routine('full-body')?.exercises.at(-1)?.name).toBe('Deadlift');
		expect(store.routine('full-body')?.exercises).toHaveLength(7);
	});

	it('adds nothing for a name the library does not know', () => {
		const store = withRoutine();
		store.addExercises('full-body', ['Tyre Flip']);
		expect(store.routine('full-body')?.exercises).toHaveLength(6);
	});

	it('adds nothing when nothing was picked', () => {
		const store = withRoutine();
		store.addExercises('full-body', []);
		expect(store.routine('full-body')?.exercises).toHaveLength(6);
	});

	it('removes the row it was asked for', () => {
		const store = withRoutine();
		store.removeExercise('full-body', 0);
		expect(store.routine('full-body')?.exercises).toHaveLength(5);
		expect(store.routine('full-body')?.exercises[0]?.name).toBe('Bench Press');
	});

	it('moves a row up past the one above it', () => {
		const store = withRoutine();
		store.moveExerciseUp('full-body', 1);
		expect(
			store
				.routine('full-body')
				?.exercises.map((e) => e.name)
				.slice(0, 2)
		).toEqual(['Bench Press', 'Squat']);
	});

	it('leaves the first row where it is, because it has nowhere to go', () => {
		const store = withRoutine();
		const before = store.routine('full-body')?.exercises.map((e) => e.name);
		store.moveExerciseUp('full-body', 0);
		expect(store.routine('full-body')?.exercises.map((e) => e.name)).toEqual(before);
	});

	it('steps only the row and the field it was pointed at', () => {
		const store = withRoutine();
		store.bumpRoutineExercise('full-body', 1, 'reps', 1);
		const exercises = store.routine('full-body')?.exercises ?? [];
		expect(exercises[1]?.reps).toBe(9);
		expect(exercises[1]?.sets).toBe(3);
		expect(exercises[0]?.reps).toBe(8);
	});

	it('steps the field where it lives, leaving every other row the object it was', () => {
		const store = withRoutine();
		const routine = store.routine('full-body');
		const otherRow = routine?.exercises[1];
		store.bumpRoutineExercise('full-body', 0, 'load', 1);
		// The sheet groups these rows by muscle; rebuilding the routine would
		// redraw every group for one stepper tap.
		expect(store.routine('full-body')).toBe(routine);
		expect(store.routine('full-body')?.exercises[1]).toBe(otherRow);
	});

	it('steps nothing for a row that is not there', () => {
		const store = withRoutine();
		store.bumpRoutineExercise('full-body', 99, 'load', 1);
		store.bumpRoutineExercise('nope', 0, 'load', 1);
		store.flushPersist();
		expect(stored().routines[0]?.exercises).toHaveLength(6);
	});

	it('stops a load at bodyweight however often it is stepped down', () => {
		const store = withRoutine();
		for (let i = 0; i < 40; i++) store.bumpRoutineExercise('full-body', 0, 'load', -1);
		expect(store.routine('full-body')?.exercises[0]?.load).toBe(0);
	});

	it('saves each change to the movements as it is made', () => {
		const store = withRoutine();
		store.addExercises('full-body', ['Deadlift']);
		expect(stored().routines[0]?.exercises).toHaveLength(7);
		store.removeExercise('full-body', 6);
		expect(stored().routines[0]?.exercises).toHaveLength(6);
		store.moveExerciseUp('full-body', 1);
		expect(stored().routines[0]?.exercises[0]?.name).toBe('Bench Press');
		store.bumpRoutineExercise('full-body', 0, 'sets', 1);
		store.flushPersist();
		expect(stored().routines[0]?.exercises[0]?.sets).toBe(4);
	});
});

describe('planning weeks', () => {
	it('assigns a routine to every week it was given', () => {
		const store = withRoutine();
		store.planWeeks(2026, [3, 5], 'full-body');
		expect(store.state.trainingPlan).toContainEqual({
			year: 2026,
			week: 3,
			routineId: 'full-body'
		});
		expect(store.state.trainingPlan).toContainEqual({
			year: 2026,
			week: 5,
			routineId: 'full-body'
		});
	});

	it('overwrites what a week was already carrying', () => {
		const store = freshStore();
		store.planWeeks(2026, [3], 'push');
		store.planWeeks(2026, [3], REST_WEEK);
		const week3 = store.state.trainingPlan.filter((p) => p.year === 2026 && p.week === 3);
		expect(week3).toHaveLength(1);
		expect(week3[0]?.routineId).toBe(REST_WEEK);
	});

	it('leaves the same week of another year alone', () => {
		const store = freshStore();
		store.planWeeks(2025, [3], 'push');
		store.planWeeks(2026, [3], 'legs');
		expect(store.state.trainingPlan).toEqual([
			{ year: 2025, week: 3, routineId: 'push' },
			{ year: 2026, week: 3, routineId: 'legs' }
		]);
	});

	it('keeps the plan in year and week order', () => {
		const store = freshStore();
		store.planWeeks(2026, [9, 2], 'push');
		store.planWeeks(2026, [5], 'legs');
		expect(store.state.trainingPlan.map((p) => p.week)).toEqual([2, 5, 9]);
	});

	it('treats an empty list of weeks as nothing to do, not as a wipe', () => {
		const store = freshStore();
		store.planWeeks(2026, [3], 'push');
		store.planWeeks(2026, [], 'legs');
		expect(store.state.trainingPlan).toEqual([{ year: 2026, week: 3, routineId: 'push' }]);
	});

	it('saves the plan as it is drawn', () => {
		const store = freshStore();
		store.planWeeks(2026, [3], 'push');
		expect(stored().trainingPlan).toEqual([{ year: 2026, week: 3, routineId: 'push' }]);
	});
});

describe('running a session', () => {
	it('opens the routine into a workout to record it', () => {
		const store = inSession();
		expect(store.state.activeWorkout?.routineName).toBe('Full body');
		expect(store.state.activeWorkout?.date).toBe(todayISO());
		expect(store.state.activeWorkout?.exercises).toHaveLength(6);
		expect(store.currentExercise?.name).toBe('Squat');
	});

	it('writes out every prescribed set, none of them ticked', () => {
		const store = inSession();
		expect(store.currentExercise?.sets).toHaveLength(3);
		expect(store.currentExercise?.sets.every((s) => !s.done)).toBe(true);
	});

	it('starts nothing for a routine that is not there', () => {
		const store = withRoutine();
		expect(store.startWorkout('nope')).toBeNull();
		expect(store.state.activeWorkout).toBeNull();
	});

	it('starts nothing for a routine with no movements in it', () => {
		const store = freshStore();
		const routine = store.createRoutine();
		expect(store.startWorkout(routine.id)).toBeNull();
		expect(store.state.activeWorkout).toBeNull();
		expect(stored().activeWorkout).toBeNull();
	});

	it('starts a routine as soon as it has something to do', () => {
		const store = freshStore();
		const routine = store.createRoutine();
		store.addExercises(routine.id, ['Deadlift']);
		expect(store.startWorkout(routine.id)?.exercises).toHaveLength(1);
	});

	it('has no exercise on screen when no session is running', () => {
		expect(freshStore().currentExercise).toBeNull();
	});

	it('ticks a set of the exercise on screen, and ticks it back off', () => {
		const store = inSession();
		store.toggleSet(1);
		expect(store.currentExercise?.sets.map((s) => s.done)).toEqual([false, true, false]);
		store.toggleSet(1);
		expect(store.currentExercise?.sets.map((s) => s.done)).toEqual([false, false, false]);
	});

	it('leaves the other movements of the session untouched', () => {
		const store = inSession();
		store.toggleSet(0);
		expect(store.state.activeWorkout?.exercises[1]?.sets.some((s) => s.done)).toBe(false);
	});

	it('steps the reps and the load of one set', () => {
		const store = inSession();
		store.bumpSet(0, 'reps', 1);
		store.bumpSet(0, 'load', -1);
		expect(store.currentExercise?.sets[0]).toEqual({ reps: 9, load: 57.5, done: false });
		expect(store.currentExercise?.sets[1]).toEqual({ reps: 8, load: 60, done: false });
	});

	it('adds a set at the last one’s numbers, waiting to be ticked', () => {
		const store = inSession();
		store.bumpSet(2, 'load', 1);
		store.toggleSet(2);
		store.addSet();
		expect(store.currentExercise?.sets).toHaveLength(4);
		expect(store.currentExercise?.sets[3]).toEqual({ reps: 8, load: 62.5, done: false });
	});

	it('keeps a note against the movement it was written about', () => {
		const store = inSession();
		store.noteExercise('bar felt heavy');
		expect(store.currentExercise?.note).toBe('bar felt heavy');
		expect(store.state.activeWorkout?.exercises[1]?.note).toBe('');
	});

	it('swaps the movement without losing the sets already logged', () => {
		const store = inSession();
		store.toggleSet(0);
		store.swapExercise('Leg Press');
		expect(store.currentExercise?.name).toBe('Leg Press');
		expect(store.currentExercise?.group).toBe('Legs');
		expect(store.currentExercise?.sets[0]?.done).toBe(true);
		expect(store.state.activeWorkout?.exercises[1]?.name).toBe('Bench Press');
	});

	it('will not swap in a movement the library does not know', () => {
		const store = inSession();
		store.swapExercise('Tyre Flip');
		expect(store.currentExercise?.name).toBe('Squat');
	});

	it('moves on to the next movement', () => {
		const store = inSession();
		store.nextExercise();
		expect(store.state.activeWorkout?.exerciseIndex).toBe(1);
		expect(store.currentExercise?.name).toBe('Bench Press');
	});

	it('stops at the last movement rather than running off the end', () => {
		const store = inSession();
		for (let i = 0; i < 20; i++) store.nextExercise();
		expect(store.state.activeWorkout?.exerciseIndex).toBe(5);
		expect(store.currentExercise?.name).toBe('Calf Raise');
	});

	it('ticks the set where it lives, leaving every other set the object it was', () => {
		const store = inSession();
		const workout = store.state.activeWorkout;
		const exercise = store.currentExercise;
		const laterSet = exercise?.sets[1];
		const otherExercise = workout?.exercises[1];
		store.toggleSet(0);
		// A rebuilt workout would answer these with new objects, and every row of
		// the session screen would rerender for one tick.
		expect(store.state.activeWorkout).toBe(workout);
		expect(store.currentExercise).toBe(exercise);
		expect(store.currentExercise?.sets[1]).toBe(laterSet);
		expect(store.state.activeWorkout?.exercises[1]).toBe(otherExercise);
		expect(store.currentExercise?.sets[0]?.done).toBe(true);
	});

	it('steps a set where it lives, leaving the sets around it the objects they were', () => {
		const store = inSession();
		const laterSet = store.currentExercise?.sets[2];
		store.bumpSet(0, 'load', 1);
		expect(store.currentExercise?.sets[2]).toBe(laterSet);
		expect(store.currentExercise?.sets[0]?.load).toBe(62.5);
	});

	it('points the next set at the first one still open, not at the count of them', () => {
		const store = inSession();
		store.toggleSet(0);
		store.toggleSet(2);
		const sets = store.currentExercise?.sets ?? [];
		// Two of three are ticked, but the one left to log is the middle one: the
		// session screen labels its button from this index, never from the count.
		expect(sets.filter((s) => s.done)).toHaveLength(2);
		expect(sets.findIndex((s) => !s.done)).toBe(1);
	});

	it('replaces an unfinished session rather than queueing a second one', () => {
		const store = inSession();
		store.toggleSet(0);
		const second = store.startWorkout('full-body');
		expect(second?.exercises[0]?.sets[0]?.done).toBe(false);
		expect(store.state.workouts).toEqual([]);
	});
});

describe('a session nobody is running', () => {
	it('has nothing to tick, step, add, note, swap or move on from', () => {
		const store = freshStore();
		store.toggleSet(0);
		store.bumpSet(0, 'load', 1);
		store.addSet();
		store.noteExercise('nothing');
		store.swapExercise('Squat');
		store.nextExercise();
		expect(store.state.activeWorkout).toBeNull();
		expect(localStorage.getItem('tend.v1')).toBeNull();
	});

	it('has nothing to file', () => {
		const store = freshStore();
		expect(store.finishWorkout()).toBeNull();
		expect(store.state.workouts).toEqual([]);
	});
});

describe('filing a session', () => {
	it('files the workout and hands it back with a finish time', () => {
		const store = inSession();
		store.toggleSet(0);
		const filed = store.finishWorkout();
		expect(filed?.finishedAt).not.toBeNull();
		expect(store.state.workouts).toHaveLength(1);
		expect(store.state.workouts[0]?.id).toBe(filed?.id);
	});

	it('clears the session once it is filed', () => {
		const store = inSession();
		store.toggleSet(0);
		store.finishWorkout();
		expect(store.state.activeWorkout).toBeNull();
		expect(store.currentExercise).toBeNull();
	});

	// Turning up and logging nothing is still something that happened, and the
	// summary has a line for it. Dropping it would send someone back to the home
	// screen as though the session had never been opened.
	it('files a session where nothing was ticked rather than dropping it', () => {
		const store = inSession();
		const filed = store.finishWorkout();
		expect(filed).not.toBeNull();
		expect(filed?.finishedAt).not.toBeNull();
		expect(store.state.workouts).toHaveLength(1);
		expect(store.state.workouts[0]?.id).toBe(filed?.id);
		expect(store.state.activeWorkout).toBeNull();
	});

	it('files an empty session with every set still not ticked', () => {
		const store = inSession();
		const filed = store.finishWorkout();
		expect(filed?.exercises.flatMap((e) => e.sets).every((set) => !set.done)).toBe(true);
		expect(stored().workouts[0]?.id).toBe(filed?.id);
	});

	it('throws away a session on request', () => {
		const store = inSession();
		store.toggleSet(0);
		store.discardWorkout();
		expect(store.state.activeWorkout).toBeNull();
		expect(store.state.workouts).toEqual([]);
	});
});

/**
 * The one answer to "did this happen?", so the week strip, the today card and
 * the adherence chart cannot disagree about a session someone walked out of.
 */
describe('what counts as training', () => {
	it('counts a filed session with a set ticked in it', () => {
		const store = inSession();
		store.toggleSet(0);
		const filed = store.finishWorkout();
		expect(filed && countsAsTraining(filed)).toBe(true);
	});

	it('does not count a filed session with nothing ticked', () => {
		const store = inSession();
		const filed = store.finishWorkout();
		expect(filed && countsAsTraining(filed)).toBe(false);
	});

	it('does not count a session that is still running', () => {
		const store = inSession();
		store.toggleSet(0);
		const running = store.state.activeWorkout;
		expect(running && countsAsTraining(running)).toBe(false);
	});
});

describe('the load unit and the rest length', () => {
	it('opens on kilograms and a ninety-second rest', () => {
		const store = freshStore();
		expect(store.state.loadUnit).toBe('kg');
		expect(store.state.restSeconds).toBe(90);
	});

	it('takes the other unit and writes it down at once', () => {
		const store = freshStore();
		store.setLoadUnit('lb');
		expect(store.state.loadUnit).toBe('lb');
		expect(stored().loadUnit).toBe('lb');
		expect(reloaded().state.loadUnit).toBe('lb');
	});

	// The unit is a label on a number, not a conversion of it: 60 was on the bar
	// whichever word is printed beside it, and rewriting the log every time
	// somebody looked at the other unit would lose what was actually lifted.
	it('leaves every load already logged exactly as it was', () => {
		const store = inSession();
		store.toggleSet(0);
		store.finishWorkout();
		const loggedLoad = store.state.workouts[0]?.exercises[0]?.sets[0]?.load;
		const prescribedLoad = store.state.routines[0]?.exercises[0]?.load;
		store.setLoadUnit('lb');
		expect(store.state.workouts[0]?.exercises[0]?.sets[0]?.load).toBe(loggedLoad);
		expect(store.state.routines[0]?.exercises[0]?.load).toBe(prescribedLoad);
	});

	it('moves the rest length within the range the control offers', async () => {
		const store = freshStore();
		store.setRestSeconds(120);
		expect(store.state.restSeconds).toBe(120);
		await vi.waitFor(() => expect(stored().restSeconds).toBe(120));
	});

	it('holds the rest length to the range rather than opening on nothing', () => {
		const store = freshStore();
		store.setRestSeconds(10);
		expect(store.state.restSeconds).toBe(30);
		store.setRestSeconds(600);
		expect(store.state.restSeconds).toBe(180);
		store.setRestSeconds(-5);
		expect(store.state.restSeconds).toBe(30);
	});

	it('keeps the rest length a whole number of seconds', () => {
		const store = freshStore();
		store.setRestSeconds(92.4);
		expect(store.state.restSeconds).toBe(92);
	});

	// The rest length is moved on a stepper, so it shares a save with the taps
	// either side of it rather than serializing the whole state on each one.
	it('lets a burst of steps share one save', async () => {
		const store = freshStore();
		store.setRestSeconds(105);
		store.setRestSeconds(120);
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		await vi.waitFor(() => expect(stored().restSeconds).toBe(120));
	});
});

describe('training across a reload', () => {
	it('saves each step of a session as it happens', () => {
		const store = inSession();
		expect(stored().activeWorkout?.routineName).toBe('Full body');
		store.toggleSet(0);
		store.flushPersist();
		expect(stored().activeWorkout?.exercises[0]?.sets[0]?.done).toBe(true);
		store.noteExercise('felt strong');
		store.flushPersist();
		expect(stored().activeWorkout?.exercises[0]?.note).toBe('felt strong');
		store.nextExercise();
		expect(stored().activeWorkout?.exerciseIndex).toBe(1);
		store.discardWorkout();
		expect(stored().activeWorkout).toBeNull();
	});

	it('comes back to a session that was left mid-set', () => {
		const store = inSession();
		store.toggleSet(0);
		store.addSet();
		const next = reloaded();
		expect(next.state.activeWorkout?.exercises[0]?.sets).toHaveLength(4);
		expect(next.currentExercise?.sets[0]?.done).toBe(true);
	});

	it('comes back to the routines, the plan and the filed workouts', () => {
		const store = inSession();
		store.planWeeks(2026, [3], 'full-body');
		store.toggleSet(0);
		store.finishWorkout();
		const next = reloaded();
		expect(next.state.routines).toHaveLength(1);
		expect(next.state.trainingPlan).toContainEqual({
			year: 2026,
			week: 3,
			routineId: 'full-body'
		});
		expect(next.state.workouts).toHaveLength(1);
		expect(next.state.activeWorkout).toBeNull();
	});
});

describe('saving a session without paying for it on every tap', () => {
	it('lets a burst of taps share one save, and makes it on its own', async () => {
		const store = inSession();
		store.toggleSet(0);
		store.bumpSet(0, 'load', 1);
		store.bumpSet(0, 'load', 1);
		// Still the session as it was opened: the taps have not each serialized
		// the whole state on the way through.
		expect(stored().activeWorkout?.exercises[0]?.sets[0]?.done).toBe(false);
		await vi.waitFor(() => {
			expect(stored().activeWorkout?.exercises[0]?.sets[0]?.done).toBe(true);
			expect(stored().activeWorkout?.exercises[0]?.sets[0]?.load).toBe(65);
		});
	});

	it('writes what the last taps were holding before the session is filed', () => {
		const store = inSession();
		store.toggleSet(0);
		const filed = store.finishWorkout();
		expect(stored().workouts[0]?.id).toBe(filed?.id);
		expect(stored().workouts[0]?.exercises[0]?.sets[0]?.done).toBe(true);
		expect(stored().activeWorkout).toBeNull();
	});

	it('writes what the last taps were holding when the tab goes away', () => {
		const store = inSession();
		store.toggleSet(1);
		window.dispatchEvent(new Event('pagehide'));
		expect(stored().activeWorkout?.exercises[0]?.sets[1]?.done).toBe(true);
	});

	// A phone backgrounds a tab rather than closing it, and may never come back.
	it('writes what the last taps were holding when the tab goes into the background', () => {
		const store = inSession();
		store.toggleSet(1);
		setVisibility('hidden');
		window.dispatchEvent(new Event('visibilitychange'));
		expect(stored().activeWorkout?.exercises[0]?.sets[1]?.done).toBe(true);
	});

	it('holds the save while the tab is still on screen', () => {
		const store = inSession();
		store.toggleSet(1);
		setVisibility('visible');
		window.dispatchEvent(new Event('visibilitychange'));
		expect(stored().activeWorkout?.exercises[0]?.sets[1]?.done).toBe(false);
	});

	it('opens an added set at a default when the exercise has none to copy', () => {
		const store = inSession();
		const exercise = store.state.activeWorkout?.exercises[0];
		if (!exercise) throw new Error('the session opened without an exercise');
		exercise.sets = [];
		store.addSet();
		expect(exercise.sets).toEqual([{ reps: 10, load: 0, done: false }]);
	});

	it('comes back to a burst that was never flushed by hand', async () => {
		const store = inSession();
		store.toggleSet(0);
		store.toggleSet(2);
		await vi.waitFor(() => expect(stored().activeWorkout?.exercises[0]?.sets[2]?.done).toBe(true));
		const next = reloaded();
		expect(next.currentExercise?.sets.map((s) => s.done)).toEqual([true, false, true]);
	});
});
