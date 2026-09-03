import { isGlp1 } from './profile';
import { recipeFits, RECIPES, type Recipe } from './recipes';
import type { PlannedMeal, PlannedMealSlot, Profile, Restriction } from './types';
import { PLANNED_MEALS } from './types';
import { addDaysISO, startOfWeek } from './utils';

/** A plan is a whole week, so a short one would leave days with nothing on them. */
const DAYS_IN_WEEK = 7;

/**
 * Everything the household's food has to satisfy: the union of every member's
 * restrictions, so one plan suits everyone, plus the protein floor a GLP-1
 * asks for. Appetite suppression makes protein the thing at risk, so it is a
 * household-wide constraint rather than one member's preference.
 */
export function householdRestrictions(profiles: Profile[]): Restriction[] {
	const out: Restriction[] = [];
	for (const p of profiles) {
		for (const r of p.restrictions) {
			if (!out.includes(r)) out.push(r);
		}
	}
	if (profiles.some(isGlp1) && !out.includes('high-protein')) out.push('high-protein');
	return out;
}

/**
 * Every recipe the household could be served for one meal.
 *
 * This is the one place the fallback rule is stated: an over-constrained
 * household would otherwise get an empty slot, and a meal that bends a
 * restriction still beats no meal at all. The pool is empty only when the
 * catalog holds no recipe for the meal at all — which the shipped catalog
 * never is, so `catalog` is a parameter to let a spec say what happens then.
 */
export function mealPool(
	profiles: Profile[],
	meal: PlannedMealSlot,
	catalog: Recipe[] = RECIPES
): Recipe[] {
	const restrictions = householdRestrictions(profiles);
	const byMeal = catalog.filter((r) => r.meal === meal);
	const fits = byMeal.filter((r) => recipeFits(r, restrictions));
	return fits.length ? fits : byMeal;
}

/**
 * Choose one recipe for a slot, favouring the least-used option so a week does
 * not become the same three dinners. The day and meal decide which of the
 * equally-unused candidates it lands on, so a rebuild is repeatable. An empty
 * pool has nothing to offer, and says so.
 */
export function pickRecipe(
	pool: Recipe[],
	meal: PlannedMealSlot,
	dayIndex: number,
	used: Record<string, number>
): Recipe | undefined {
	const offset = dayIndex * PLANNED_MEALS.length + PLANNED_MEALS.indexOf(meal);
	const fewest = Math.min(...pool.map((r) => used[r.id] ?? 0));
	const leastUsed = pool.filter((r) => (used[r.id] ?? 0) === fewest);
	return leastUsed[offset % leastUsed.length];
}

/** Seven days of every planned meal, starting from the Monday of `today`'s week. */
export function buildWeekPlan(args: {
	profiles: Profile[];
	today: string;
	catalog?: Recipe[];
}): PlannedMeal[] {
	const { profiles, today, catalog } = args;
	const forProfileIds = profiles.map((p) => p.id);
	const pools = Object.fromEntries(
		PLANNED_MEALS.map((meal) => [meal, mealPool(profiles, meal, catalog)])
	) as Record<PlannedMealSlot, Recipe[]>;
	const dates = Array.from({ length: DAYS_IN_WEEK }, (_, day) =>
		addDaysISO(startOfWeek(today), day)
	);
	const used: Record<string, number> = {};
	const plan: PlannedMeal[] = [];

	for (const [dayIndex, date] of dates.entries()) {
		for (const meal of PLANNED_MEALS) {
			const pick = pickRecipe(pools[meal], meal, dayIndex, used);
			// A catalog with no recipe at all for this meal leaves the slot empty
			// rather than crashing the week.
			if (!pick) continue;
			used[pick.id] = (used[pick.id] ?? 0) + 1;
			plan.push({ date, meal, recipeId: pick.id, forProfileIds });
		}
	}
	return plan;
}
