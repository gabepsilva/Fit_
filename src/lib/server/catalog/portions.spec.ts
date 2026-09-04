import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { withPortions } from './portions';

/** A catalog holding nothing but the serving rows a case needs. */
function catalogOf(rows: [id: number, label: unknown, grams: unknown, isDefault: number][]) {
	const db = new DatabaseSync(':memory:');
	db.exec(
		`create table food_serving (food_id bigint, label varchar, grams double, is_default bigint);
		create index idx_serving_food on food_serving (food_id);`
	);
	const insert = db.prepare(
		'insert into food_serving (food_id, label, grams, is_default) values (?, ?, ?, ?)'
	);
	for (const [id, label, grams, isDefault] of rows)
		insert.run(id, label as string, grams as number, isDefault);
	return db;
}

/** The portions of each id, in the order asked, as `withPortions` answers them. */
function portionsOf(db: DatabaseSync, ids: number[]) {
	return withPortions(
		db,
		ids.map((id) => ({ id }))
	).map((food) => food.portions);
}

describe('withPortions', () => {
	let db: DatabaseSync;

	beforeEach(() => {
		db = catalogOf([
			[1, '1 Tbsp (15 ml)', 13.5, 1],
			[1, '1 tsp', 4.5, 0],
			[1, '100 g', 100, 0],
			[2, '1 PUDDING CUP', 99, 1],
			[2, '3 CUPCAKES', 150, 0]
		]);
	});

	it('reads what one of each volume unit weighs', () => {
		expect(portionsOf(db, [1])).toEqual([
			[
				{ unit: 'tbsp', grams: 13.5 },
				{ unit: 'tsp', grams: 4.5 }
			]
		]);
	});

	it('keeps every other column of the food it was given', () => {
		expect(withPortions(db, [{ id: 2, name: 'PUDDING' }])).toEqual([
			{ id: 2, name: 'PUDDING', portions: [] }
		]);
	});

	it('answers for every food asked about, including one with no volume at all', () => {
		expect(portionsOf(db, [1, 2, 99])).toEqual([
			[
				{ unit: 'tbsp', grams: 13.5 },
				{ unit: 'tsp', grams: 4.5 }
			],
			[],
			[]
		]);
	});

	it('answers nothing when there are no foods to ask about', () => {
		expect(withPortions(db, [])).toEqual([]);
	});

	it('keeps the food’s own default serving over another row naming the same unit', () => {
		// Both rows say "cup"; the one the food is served by is the one to scale by.
		const catalog = catalogOf([
			[1, '2 cup', 500, 0],
			[1, '1 cup', 244, 1]
		]);
		expect(portionsOf(catalog, [1])).toEqual([[{ unit: 'cup', grams: 244 }]]);
	});

	it('breaks a tie between two rows of the same standing on the label text', () => {
		const catalog = catalogOf([
			[1, '2 cup', 500, 0],
			[1, '1 cup', 244, 0]
		]);
		expect(portionsOf(catalog, [1])).toEqual([[{ unit: 'cup', grams: 244 }]]);
	});

	it('skips a row whose columns have changed shape rather than failing the search', () => {
		const catalog = catalogOf([
			[1, Uint8Array.of(1, 2), 244, 1],
			[1, '1 tbsp', Uint8Array.of(1, 4), 0],
			[1, '1 cup', 244, 0]
		]);
		expect(portionsOf(catalog, [1])).toEqual([[{ unit: 'cup', grams: 244 }]]);
	});
});
