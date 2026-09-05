import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { parsePortionLabel, type Portion } from '$lib/domain/portions';
import { prepared } from './statements';

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
 * search returns at most fifty rows and this reads all of their portions in one
 * statement through `idx_serving_food`.
 */

/**
 * Every serving row of a page of foods, grouped by food and ordered within each
 * group by the food's own default first.
 *
 * One statement for the page rather than a point lookup per food. The lookup
 * was cheap — `idx_serving_food` is an index seek — but it was paid twenty
 * times for a twenty-food page, and each of those crosses into SQLite and
 * builds its own result set. Measured on the 1.4 GB catalog, warm, over eight
 * queries at the default page size: p50 0.303 ms per page one row at a time
 * against 0.135 ms in one statement.
 *
 * The order is what decides between two rows naming the same unit — a food with
 * both `1 Tbsp` and `2 Tbsp` — so it is stated rather than left to the table's
 * insertion order: the label the food itself is served by wins, and ties break
 * on the label text so the same catalog always answers the same way. `food_id`
 * leads it so that the rows of one food arrive together and the grouping below
 * is a single pass.
 *
 * `typeof` refuses a column that has changed shape, and refuses it here rather
 * than in TypeScript for the reason `foods.ts` gives about the ETL owning this
 * file: a row whose label arrived as a blob is one row to leave out, not a
 * reason to fail the search that found the food. Filtering in the query is what
 * lets the two reads below be exact rather than coercions.
 *
 * The bound list is one parameter per food, which `pageSize` caps at fifty and
 * a barcode's duplicate rows never approach — far below SQLite's variable
 * limit, so there is no batching to do.
 */
function servingsSql(foods: number): string {
	return `select food_id, label, grams from food_serving
		where food_id in (${Array.from({ length: foods }, () => '?').join(', ')})
			and typeof(label) = 'text' and typeof(grams) in ('real', 'integer')
		order by food_id, is_default desc, label`;
}

/** What one of each volume unit weighs, per food, from one read of their serving rows. */
function volumesByFood(catalog: DatabaseSync, ids: readonly number[]): Map<number, Portion[]> {
	const byFood = new Map<number, Portion[]>();
	if (ids.length === 0) return byFood;
	const rows: Record<string, SQLOutputValue>[] = prepared(catalog, servingsSql(ids.length)).all(
		...ids
	);
	for (const row of rows) {
		const portion = parsePortionLabel(String(row['label']), Number(row['grams']));
		if (portion === null) continue;
		const held = byFood.get(Number(row['food_id']));
		// The first row naming a unit wins, which the ordering above makes the
		// food's own serving rather than whichever row the table holds first.
		if (held === undefined) byFood.set(Number(row['food_id']), [portion]);
		else if (!held.some((each: Portion) => each.unit === portion.unit)) held.push(portion);
	}
	return byFood;
}

/**
 * The foods, each carrying what one of every volume unit weighs for it.
 *
 * Structural in the food rather than typed to `CatalogFood`: that type is
 * declared in `foods.ts`, which calls this, and naming it here would make the
 * two modules import each other.
 *
 * Ids are deduplicated on the way into the query and matched back by id on the
 * way out, so a page holding the same food twice reads it once and both copies
 * still answer.
 */
export function withPortions<T extends { id: number }>(
	catalog: DatabaseSync,
	foods: readonly T[]
): (T & { portions: Portion[] })[] {
	const byFood = volumesByFood(catalog, [...new Set(foods.map((food) => food.id))]);
	return foods.map((food) => ({ ...food, portions: byFood.get(food.id) ?? [] }));
}
