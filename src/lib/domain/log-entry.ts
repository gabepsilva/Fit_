import { FOOD_BY_ID, scaleFood } from './foods';
import type { LogItem, LogSource, Meal } from './types';
import { uid } from './utils';

export type LogFromFood = {
	foodId: string;
	servings: number;
	meal: Meal;
	date: string;
	source: LogSource;
	note?: string | undefined;
};

/**
 * Build a log entry from a catalog food. `scaleFood` already returns every
 * nutrition field an entry carries, so this is the single seam between a food
 * and a log line: manual logging, the seeded journals and re-scaling an
 * existing entry all come through here rather than each restating the mapping.
 *
 * An unknown id throws rather than logging a zero-calorie line, because a
 * silent empty entry is worse than a loud refusal.
 */
export function logFromFood({ foodId, servings, meal, date, source, note }: LogFromFood): LogItem {
	const food = FOOD_BY_ID[foodId];
	if (!food) throw new Error(`Unknown food: ${foodId}`);
	return { id: uid('l-'), date, meal, source, note, servings, ...scaleFood(food, servings) };
}
