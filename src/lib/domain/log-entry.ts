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
 * Build a log entry from a catalog food via `scaleFood`.
 * An unknown id throws rather than logging a zero-calorie line.
 */
export function logFromFood({ foodId, servings, meal, date, source, note }: LogFromFood): LogItem {
	const food = FOOD_BY_ID[foodId];
	if (!food) throw new Error(`Unknown food: ${foodId}`);
	return { id: uid('l-'), date, meal, source, note, servings, ...scaleFood(food, servings) };
}
