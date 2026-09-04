import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { parsePortionLabel, type Portion, type VolumeUnit } from '$lib/domain/portions';

/**
 * The household measures the catalog holds for a food, as weights the client
 * can scale by.
 *
 * `food_serving` is 3.5 million rows of free text — `2 Tbsp`, `1 Tbsp (15 ml)`,
 * `0.25 cup`, `1 PUDDING CUP`, `100 g` — and only a fraction of it states a
 * volume outright. `parsePortionLabel` is the one place that decides which, so
 * the server and the bundled catalog agree on what a label means; this module
 * is only the query and the pick between competing rows.
 *
 * Separate from `foods.ts` because it is a second query on a second table: the
 * search returns at most fifty rows and this reads each one's portions through
 * `idx_serving_food`, which is a point lookup per result, not a scan.
 */

/**
 * A food's serving rows, its own default serving first.
 *
 * The order is what decides between two rows naming the same unit — a food with
 * both `1 Tbsp` and `2 Tbsp` — so it is stated rather than left to the table's
 * insertion order: the label the food itself is served by wins, and ties break
 * on the label text so the same catalog always answers the same way.
 *
 * `typeof` refuses a column that has changed shape, and refuses it here rather
 * than in TypeScript for the reason `foods.ts` gives about the ETL owning this
 * file: a row whose label arrived as a blob is one row to leave out, not a
 * reason to fail the search that found the food. Filtering in the query is what
 * lets the two reads below be exact rather than coercions.
 */
const SERVINGS = `select label, grams from food_serving
	where food_id = ? and typeof(label) = 'text' and typeof(grams) in ('real', 'integer')
	order by is_default desc, label`;

/** What one of each volume unit weighs, from one food's serving rows. */
function volumesOf(rows: readonly Record<string, SQLOutputValue>[]): Portion[] {
	const byUnit = new Map<VolumeUnit, Portion>();
	for (const row of rows) {
		const portion = parsePortionLabel(String(row['label']), Number(row['grams']));
		if (portion !== null && !byUnit.has(portion.unit)) byUnit.set(portion.unit, portion);
	}
	return [...byUnit.values()];
}

/**
 * The foods, each carrying what one of every volume unit weighs for it.
 *
 * Structural in the food rather than typed to `CatalogFood`: that type is
 * declared in `foods.ts`, which calls this, and naming it here would make the
 * two modules import each other.
 */
export function withPortions<T extends { id: number }>(
	catalog: DatabaseSync,
	foods: readonly T[]
): (T & { portions: Portion[] })[] {
	const servings = catalog.prepare(SERVINGS);
	return foods.map((food) => ({ ...food, portions: volumesOf(servings.all(food.id)) }));
}
