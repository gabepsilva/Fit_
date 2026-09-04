import { FOOD_BY_ID, scaleFood } from './foods';
import type { Food, LogItem, LogSource, Meal } from './types';
import { uid } from './utils';

export type LogFromFood = {
	foodId: string;
	servings: number;
	meal: Meal;
	date: string;
	source: LogSource;
	note?: string | undefined;
};

/** Everything a log entry needs beyond the food itself. */
export type LogEntryContext = Omit<LogFromFood, 'foodId'>;

function entry(food: Food, foodId: string | null, context: LogEntryContext): LogItem {
	const { servings, meal, date, source, note } = context;
	return {
		id: uid('l-'),
		date,
		meal,
		source,
		note,
		servings,
		...scaleFood(food, servings),
		foodId
	};
}

/**
 * Build a log entry from a catalog food via `scaleFood`.
 * An unknown id throws rather than logging a zero-calorie line.
 */
export function logFromFood({ foodId, ...context }: LogFromFood): LogItem {
	const food = FOOD_BY_ID[foodId];
	if (!food) throw new Error(`Unknown food: ${foodId}`);
	return entry(food, foodId, context);
}

/**
 * Build a log entry from a food that came from the server catalog rather than
 * the bundled one.
 *
 * `foodId` is null on purpose. The catalog's own id is a hint the ETL does not
 * promise to keep -- it rebuilds the file wholesale -- so an entry stored
 * against it would point at a different food, or at nothing, after the next
 * rebuild. The entry carries its own name, serving label and macros, which is
 * what makes it stay right without one, and is already how an imported row is
 * logged.
 */
export function logFromCatalogFood(food: Food, context: LogEntryContext): LogItem {
	return entry(food, null, context);
}
