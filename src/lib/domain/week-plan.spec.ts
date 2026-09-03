import { describe, expect, it } from 'vitest';
import { emptyProfile } from './profile';
import { RECIPE_BY_ID, RECIPES, recipeFits } from './recipes';
import { PLANNED_MEALS, type Profile } from './types';
import { buildWeekPlan, householdRestrictions, mealPool, pickRecipe } from './week-plan';

/** A Monday, so the plan starts on the day it is asked for. */
const MONDAY = '2026-06-01';
/** The Wednesday of the same week. */
const WEDNESDAY = '2026-06-03';

function person(partial: Partial<Profile> = {}): Profile {
	return emptyProfile({ name: 'Alex', ...partial });
}

describe('household restrictions', () => {
	it('is empty for a household that eats anything', () => {
		expect(householdRestrictions([person()])).toEqual([]);
	});

	it('unions every member, naming each one once', () => {
		const out = householdRestrictions([
			person({ restrictions: ['vegetarian', 'nut-free'] }),
			person({ name: 'Jordan', restrictions: ['nut-free', 'low-sodium'] })
		]);
		expect([...out].sort()).toEqual(['low-sodium', 'nut-free', 'vegetarian']);
	});

	it('raises a protein floor for the household when one member is on a GLP-1', () => {
		expect(householdRestrictions([person({ glp1: true }), person({ name: 'Jordan' })])).toContain(
			'high-protein'
		);
	});

	it('does not name the protein floor twice', () => {
		const out = householdRestrictions([person({ glp1: true, restrictions: ['high-protein'] })]);
		expect(out.filter((r) => r === 'high-protein')).toHaveLength(1);
	});

	it('leaves a household off a GLP-1 unconstrained', () => {
		expect(householdRestrictions([person()])).not.toContain('high-protein');
	});
});

describe('the pool for one meal', () => {
	it('offers only recipes for that meal', () => {
		for (const meal of PLANNED_MEALS) {
			expect(mealPool([person()], meal).every((r) => r.meal === meal)).toBe(true);
		}
	});

	it('drops what the household cannot eat', () => {
		const pool = mealPool([person({ restrictions: ['vegetarian'] })], 'dinner');
		expect(pool.length).toBeGreaterThan(0);
		expect(pool.every((r) => recipeFits(r, ['vegetarian']))).toBe(true);
	});

	it('bends the restriction rather than offering nothing', () => {
		// Nothing on the breakfast menu is vegan, so the pool falls back whole.
		const vegan = person({ restrictions: ['vegan'] });
		expect(RECIPES.some((r) => r.meal === 'breakfast' && recipeFits(r, ['vegan']))).toBe(false);
		expect(mealPool([vegan], 'breakfast')).toEqual(RECIPES.filter((r) => r.meal === 'breakfast'));
	});

	it('bends only the meal that has nothing, not the rest of the week', () => {
		const vegan = person({ restrictions: ['vegan'] });
		expect(mealPool([vegan], 'dinner').every((r) => recipeFits(r, ['vegan']))).toBe(true);
	});
});

describe('picking one recipe', () => {
	it('has nothing to offer from an empty pool', () => {
		expect(pickRecipe([], 'dinner', 0, {})).toBeUndefined();
	});

	it('passes over a recipe already used this week', () => {
		const pool = mealPool([person()], 'dinner');
		const used: Record<string, number> = { [pool[0]?.id ?? '']: 1 };
		expect(pickRecipe(pool, 'dinner', 0, used)?.id).not.toBe(pool[0]?.id);
	});

	it('lands on the same recipe for the same day and meal', () => {
		const pool = mealPool([person()], 'lunch');
		expect(pickRecipe(pool, 'lunch', 3, {})).toBe(pickRecipe(pool, 'lunch', 3, {}));
	});

	it('separates two meals of one day', () => {
		const pool = mealPool([person()], 'dinner');
		expect(pickRecipe(pool, 'dinner', 0, {})).not.toBe(pickRecipe(pool, 'breakfast', 0, {}));
	});
});

describe('building a week', () => {
	it('fills three meals for each of seven days', () => {
		expect(buildWeekPlan({ profiles: [person()], today: MONDAY })).toHaveLength(21);
	});

	it('starts on the Monday of the week it is asked for', () => {
		const plan = buildWeekPlan({ profiles: [person()], today: WEDNESDAY });
		expect(plan[0]?.date).toBe(MONDAY);
		expect(plan.at(-1)?.date).toBe('2026-06-07');
	});

	it('matches every slot to a recipe for its own meal', () => {
		for (const slot of buildWeekPlan({ profiles: [person()], today: MONDAY })) {
			expect(RECIPE_BY_ID[slot.recipeId]?.meal).toBe(slot.meal);
		}
	});

	it('names everyone in the household on every slot', () => {
		const household = [person(), person({ name: 'Jordan' })];
		const plan = buildWeekPlan({ profiles: household, today: MONDAY });
		for (const slot of plan) {
			expect(slot.forProfileIds).toEqual(household.map((p) => p.id));
		}
	});

	it('uses every recipe a meal offers before repeating one', () => {
		const plan = buildWeekPlan({ profiles: [person()], today: MONDAY });
		for (const meal of PLANNED_MEALS) {
			const chosen = new Set(plan.filter((p) => p.meal === meal).map((p) => p.recipeId));
			expect(chosen.size).toBe(Math.min(7, mealPool([person()], meal).length));
		}
	});

	it('honours a restriction everywhere it can', () => {
		const plan = buildWeekPlan({ profiles: [person({ restrictions: ['vegan'] })], today: MONDAY });
		expect(plan).toHaveLength(21);
		for (const slot of plan.filter((p) => p.meal !== 'breakfast')) {
			expect(RECIPE_BY_ID[slot.recipeId]?.suits).toContain('vegan');
		}
	});

	it('still plans a week for an impossible set of restrictions', () => {
		const plan = buildWeekPlan({
			profiles: [
				person({ restrictions: ['vegan', 'nut-free', 'gluten-free', 'low-sodium', 'high-protein'] })
			],
			today: MONDAY
		});
		expect(plan).toHaveLength(21);
	});

	it('is repeatable for the same household and week', () => {
		const args = { profiles: [person()], today: MONDAY };
		expect(buildWeekPlan(args)).toEqual(buildWeekPlan(args));
	});
});
