import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProfile } from '$lib/domain/profile';
import { RECIPE_BY_ID, RECIPES, recipeFits } from '$lib/domain/recipes';
import type { Injection, LogItem, Profile, TendState } from '$lib/domain/types';
import { PLANNED_MEALS, ZERO_MICROS } from '$lib/domain/types';
import { todayISO } from '$lib/domain/utils';
import { STORAGE_KEY, TendStore } from './tend.svelte';

function freshStore() {
	localStorage.clear();
	const store = new TendStore();
	store.hydrate();
	return store;
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
});

describe('the log', () => {
	it('adds an entry for the active profile', () => {
		const store = onboarded();
		store.addLogFromFood({ foodId: 'egg-large', servings: 2, meal: 'breakfast' });
		expect(store.profile?.log).toHaveLength(1);
		expect(store.profile?.log[0]?.kcal).toBe(144);
		expect(store.profile?.log[0]?.protein).toBe(12.6);
	});

	it('dates a new entry today by default', () => {
		const store = onboarded();
		store.addLogFromFood({ foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		expect(store.profile?.log[0]?.date).toBe(todayISO());
	});

	it('calls an entry manual when nothing else said where it came from', () => {
		const store = onboarded();
		store.addLogFromFood({ foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		expect(store.profile?.log[0]?.source).toBe('manual');
	});

	it('keeps the source an entry was logged with', () => {
		const store = onboarded();
		store.addLogFromFood({ foodId: 'egg-large', servings: 1, meal: 'breakfast', source: 'photo' });
		expect(store.profile?.log[0]?.source).toBe('photo');
	});

	it('re-derives a catalog entry from its food when the servings change', () => {
		const store = onboarded();
		store.addLogFromFood({ foodId: 'egg-large', servings: 0.5, meal: 'breakfast' });
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
		store.addLogFromFood({ foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		const id = store.profile?.log[0]?.id ?? '';
		store.updateLog(id, { note: 'runny' });
		const after = store.profile?.log[0];
		expect(after?.note).toBe('runny');
		expect(after?.servings).toBe(1);
		expect(after?.kcal).toBe(72);
	});

	it('does not re-derive an edited entry when the serving count is unchanged', () => {
		const store = onboarded();
		store.addLogFromFood({ foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		const id = store.profile?.log[0]?.id ?? '';
		store.updateLog(id, { kcal: 999 });
		store.updateLog(id, { servings: 1, note: 'as weighed' });
		const after = store.profile?.log[0];
		expect(after?.kcal).toBe(999);
		expect(after?.note).toBe('as weighed');
	});

	it('removes only the entry it was asked for', () => {
		const store = onboarded();
		store.addLogFromFood({ foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		store.addLogFromFood({ foodId: 'egg-large', servings: 2, meal: 'lunch' });
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

	it('removes only the dose it was asked for', () => {
		const store = onboarded();
		store.addInjection(dose);
		store.addInjection({ ...dose, date: '2026-06-08', doseMg: 1 });
		store.removeInjection(store.profile?.injections[0]?.id ?? '');
		expect(store.profile?.injections).toHaveLength(1);
		expect(store.profile?.injections[0]?.doseMg).toBe(1);
	});
});

describe('profiles', () => {
	it('switches the active profile', () => {
		const store = onboarded();
		const other = emptyProfile({ name: 'Jordan' });
		store.addProfile(other);
		store.setActive(other.id);
		expect(store.profile?.name).toBe('Jordan');
	});

	it('falls back to the remaining profile when the active one is removed', () => {
		const store = onboarded();
		const other = emptyProfile({ name: 'Jordan' });
		store.addProfile(other);
		store.removeProfile(store.state.activeProfileId);
		expect(store.profile?.name).toBe('Jordan');
	});

	it('keeps the active profile when a different one is removed', () => {
		const store = onboarded();
		const second = emptyProfile({ name: 'Jordan' });
		const third = emptyProfile({ name: 'Sam' });
		store.addProfile(second);
		store.addProfile(third);
		store.setActive(third.id);
		store.removeProfile(second.id);
		expect(store.state.activeProfileId).toBe(third.id);
		expect(store.profile?.name).toBe('Sam');
	});

	it('has no active profile left when the last one is removed', () => {
		const store = onboarded();
		store.removeProfile(store.state.activeProfileId);
		expect(store.state.profiles).toEqual([]);
		expect(store.state.activeProfileId).toBe('');
		expect(store.profile).toBeNull();
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
		store.setPlan([
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
		store.setPlan([
			{ date: '2026-06-01', meal: 'dinner', recipeId: fits[0]?.id ?? '', forProfileIds: [] }
		]);
		store.swapPlanned('2026-06-01', 'dinner');
		expect(store.state.weekPlan[0]?.recipeId).toBe(fits[1]?.id);
	});

	it('accepts a plan set wholesale', () => {
		const store = onboarded();
		store.setPlan([]);
		expect(store.state.weekPlan).toEqual([]);
	});
});

describe('the pantry', () => {
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

	it('replaces the state from an import', () => {
		const store = freshStore();
		store.replaceState({
			onboarded: true,
			activeProfileId: 'p1',
			profiles: [{ ...emptyProfile({ name: 'Imported' }), id: 'p1' }],
			weekPlan: [],
			pantry: []
		});
		expect(store.profile?.name).toBe('Imported');
	});

	it('writes an import through even when the store was never hydrated', () => {
		const store = new TendStore();
		store.replaceState({
			onboarded: true,
			activeProfileId: 'p1',
			profiles: [{ ...emptyProfile({ name: 'Imported' }), id: 'p1' }],
			weekPlan: [],
			pantry: []
		});
		expect(store.hydrated).toBe(true);
		expect(stored().profiles[0]?.name).toBe('Imported');
	});
});

describe('persistence', () => {
	it('writes the payload under the key an older build would read', () => {
		onboarded();
		expect(localStorage.getItem('tend.v1')).not.toBeNull();
		expect(stored().onboarded).toBe(true);
		expect(stored().profiles[0]?.name).toBe('Alex');
	});

	it('saves each change to the log as it is made', () => {
		const store = onboarded();
		store.addLogFromFood({ foodId: 'egg-large', servings: 1, meal: 'breakfast' });
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
		store.removeInjection(store.profile?.injections[0]?.id ?? '');
		expect(stored().profiles[0]?.injections).toEqual([]);
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
		store.removeProfile(other.id);
		expect(stored().profiles).toHaveLength(1);
	});

	it('saves each change to the plan and the pantry as it is made', () => {
		const store = onboarded();
		const dinners = RECIPES.filter((r) => r.meal === 'dinner');
		store.setPlan([
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
		store.addLogFromFood({ foodId: 'egg-large', servings: 2, meal: 'breakfast' });
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

	it('ignores a dose removal', () => {
		const store = freshStore();
		store.removeInjection('nope');
		expect(store.profile).toBeNull();
		expect(localStorage.getItem('tend.v1')).toBeNull();
	});

	it('leaves unrelated entries untouched when patching', () => {
		const store = onboarded();
		store.addLogFromFood({ foodId: 'egg-large', servings: 1, meal: 'breakfast' });
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
