import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProfile } from '$lib/domain/demo-seed';
import { FOOD_BY_ID } from '$lib/domain/foods';
import { RECIPE_BY_ID } from '$lib/domain/recipes';
import type { Profile } from '$lib/domain/types';
import { todayISO } from '$lib/domain/utils';
import { logFromFood, STORAGE_KEY, TendStore } from './tend.svelte';

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

beforeEach(() => localStorage.clear());

describe('logFromFood', () => {
	it('builds an entry from a catalog food', () => {
		const item = logFromFood({
			foodId: 'egg-large',
			servings: 2,
			meal: 'breakfast',
			date: '2026-06-01',
			source: 'manual'
		});
		expect(item.kcal).toBe((FOOD_BY_ID['egg-large']?.kcal ?? 0) * 2);
	});

	it('refuses to invent an entry for an unknown food', () => {
		expect(() =>
			logFromFood({
				foodId: 'not-a-food',
				servings: 1,
				meal: 'lunch',
				date: '2026-06-01',
				source: 'manual'
			})
		).toThrow();
	});
});

describe('hydration', () => {
	it('starts empty when there is nothing stored', () => {
		const store = freshStore();
		expect(store.state.onboarded).toBe(false);
		expect(store.hydrated).toBe(true);
	});

	it('restores a previously persisted state', () => {
		const first = onboarded();
		const second = new TendStore();
		second.hydrate();
		expect(second.state.profiles).toHaveLength(first.state.profiles.length);
	});

	it('starts clean rather than throwing on a corrupt payload', () => {
		localStorage.setItem(STORAGE_KEY, '{not json');
		const store = new TendStore();
		store.hydrate();
		expect(store.state.onboarded).toBe(false);
	});

	it('fills in keys missing from an older payload', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ onboarded: true }));
		const store = new TendStore();
		store.hydrate();
		expect(store.state.pantry).toEqual([]);
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
		expect(onboarded().state.onboarded).toBe(true);
	});

	it('makes the new profile active', () => {
		const store = onboarded();
		expect(store.profile?.name).toBe('Alex');
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
	});

	it('seeds a lived-in log when the sample journal is chosen', () => {
		const store = freshStore();
		store.completeOnboarding({
			profile: emptyProfile({ name: 'Alex' }),
			household: false,
			useSample: true
		});
		expect(store.profile?.log.length).toBeGreaterThan(0);
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
	});

	it('dates a new entry today by default', () => {
		const store = onboarded();
		store.addLogFromFood({ foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		expect(store.profile?.log[0]?.date).toBe(todayISO());
	});

	it('re-derives nutrition when the servings change', () => {
		const store = onboarded();
		store.addLogFromFood({ foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		const id = store.profile?.log[0]?.id ?? '';
		const before = store.profile?.log[0]?.kcal ?? 0;
		store.updateLog(id, { servings: 2 });
		expect(store.profile?.log[0]?.kcal).toBe(before * 2);
	});

	it('scales a custom entry by ratio when it has no catalog food behind it', () => {
		const store = onboarded();
		store.addLogItems([
			{
				id: 'custom',
				foodId: null,
				date: todayISO(),
				meal: 'lunch',
				servings: 1,
				source: 'manual',
				name: 'Leftovers',
				kcal: 400,
				protein: 20,
				carbs: 40,
				fat: 15,
				micros: {
					fiber: 4,
					sugar: 0,
					sodium: 0,
					potassium: 0,
					iron: 0,
					calcium: 0,
					magnesium: 0,
					zinc: 0,
					vitaminA: 0,
					vitaminC: 0,
					vitaminD: 0,
					vitaminB12: 0,
					folate: 0
				},
				servingLabel: 'plate'
			}
		]);
		store.updateLog('custom', { servings: 2 });
		expect(store.profile?.log[0]?.kcal).toBe(800);
	});

	it('leaves other fields alone when patching without a serving change', () => {
		const store = onboarded();
		store.addLogFromFood({ foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		const id = store.profile?.log[0]?.id ?? '';
		store.updateLog(id, { note: 'runny' });
		expect(store.profile?.log[0]?.note).toBe('runny');
	});

	it('removes an entry', () => {
		const store = onboarded();
		store.addLogFromFood({ foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		store.removeLog(store.profile?.log[0]?.id ?? '');
		expect(store.profile?.log).toHaveLength(0);
	});

	it('ignores a log write when no profile is active', () => {
		const store = freshStore();
		store.addLogItems([]);
		expect(store.profile).toBeNull();
	});
});

describe('weigh-ins', () => {
	it('records a reading', () => {
		const store = onboarded();
		store.addWeight(80);
		expect(store.profile?.weights).toHaveLength(1);
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
	const dose = {
		date: '2026-06-01',
		medication: 'semaglutide' as const,
		doseMg: 0.5,
		site: 'abdomen' as const,
		appetite: 3 as const,
		sideEffects: [],
		notes: ''
	};

	it('records a dose', () => {
		const store = onboarded();
		store.addInjection(dose);
		expect(store.profile?.injections).toHaveLength(1);
	});

	it('removes a dose', () => {
		const store = onboarded();
		store.addInjection(dose);
		store.removeInjection(store.profile?.injections[0]?.id ?? '');
		expect(store.profile?.injections).toHaveLength(0);
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

	it('patches only the active profile', () => {
		const store = onboarded();
		const other = emptyProfile({ name: 'Jordan' });
		store.addProfile(other);
		store.patchActive((p) => ({ ...p, glp1: true }));
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

	it('honours a household restriction', () => {
		const store = onboarded({ restrictions: ['vegetarian'] });
		for (const slot of store.state.weekPlan) {
			expect(RECIPE_BY_ID[slot.recipeId]?.suits).toContain('vegetarian');
		}
	});

	it('swaps a slot for a different recipe', () => {
		const store = onboarded();
		const slot = store.state.weekPlan[0];
		if (!slot) throw new Error('onboarding produced no plan');
		store.swapPlanned(slot.date, slot.meal);
		const after = store.state.weekPlan.find((p) => p.date === slot.date && p.meal === slot.meal);
		expect(after?.recipeId).not.toBe(slot.recipeId);
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

	it('removes it again on a second toggle', () => {
		const store = onboarded();
		store.togglePantry('egg-large');
		store.togglePantry('egg-large');
		expect(store.state.pantry).toEqual([]);
	});
});

describe('whole-state operations', () => {
	it('clears everything on reset', () => {
		const store = onboarded();
		store.resetAll();
		expect(store.state.onboarded).toBe(false);
		expect(store.state.profiles).toEqual([]);
	});

	it('clears persisted storage on reset', () => {
		const store = onboarded();
		store.resetAll();
		const reloaded = new TendStore();
		reloaded.hydrate();
		expect(reloaded.state.onboarded).toBe(false);
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
});

describe('guards when nothing is active', () => {
	it('ignores a serving change', () => {
		const store = freshStore();
		store.updateLog('nope', { servings: 2 });
		expect(store.profile).toBeNull();
	});

	it('ignores a removal', () => {
		const store = freshStore();
		store.removeLog('nope');
		expect(store.profile).toBeNull();
	});

	it('ignores a weigh-in', () => {
		const store = freshStore();
		store.addWeight(80);
		expect(store.profile).toBeNull();
	});

	it('ignores a dose', () => {
		const store = freshStore();
		store.addInjection({
			date: '2026-06-01',
			medication: 'semaglutide',
			doseMg: 0.5,
			site: 'abdomen',
			appetite: 3,
			sideEffects: [],
			notes: ''
		});
		expect(store.profile).toBeNull();
	});

	it('ignores a dose removal', () => {
		const store = freshStore();
		store.removeInjection('nope');
		expect(store.profile).toBeNull();
	});

	it('leaves unrelated entries untouched when patching', () => {
		const store = onboarded();
		store.addLogFromFood({ foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		store.updateLog('not-this-one', { servings: 5 });
		expect(store.profile?.log[0]?.servings).toBe(1);
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
		expect(store.state.weekPlan.length).toBeGreaterThan(0);
	});

	it('raises protein for a GLP-1 household', () => {
		const store = freshStore();
		store.completeOnboarding({
			profile: { ...emptyProfile({ name: 'Alex' }), glp1: true, goal: 'glp1' },
			household: false,
			useSample: false
		});
		expect(store.state.weekPlan.length).toBeGreaterThan(0);
	});

	it('leaves a slot alone when there is nothing to swap it for', () => {
		const store = onboarded();
		const before = [...store.state.weekPlan];
		store.swapPlanned('1999-01-01', 'dinner');
		expect(store.state.weekPlan).toHaveLength(before.length);
	});
});
