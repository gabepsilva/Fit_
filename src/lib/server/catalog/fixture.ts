import { DatabaseSync } from 'node:sqlite';

/**
 * A catalog of a dozen rows, in the shape `data/scripts/build_db.py` builds.
 *
 * It exists so the ranking is asserted rather than hoped for. The real catalog
 * is a 365 MB file that is not in the repository and not in CI, so the rows
 * here are chosen to reproduce the defect it exhibits: ordered by `quality`
 * alone, "milk" answers with milk chocolate pretzels and a yogurt before it
 * answers with milk, and "banana" answers with a bread mix before the fruit.
 *
 * Every column the ranking reads is real: `quality` 94 for branded rows and 90
 * or 91 for generic ones is the inversion the live data has, and `n_sources`
 * 247 on "Milk, whole" is its actual value.
 */
type FixtureRow = {
	id: number;
	name: string;
	brand: string | null;
	kind: 'branded' | 'generic';
	quality: number;
	sources: number;
	barcode: string | null;
	alias: string | null;
};

const FIXTURE_FOODS: FixtureRow[] = [
	{
		id: 1,
		name: 'TORN & GLASSER, MILK CHOCOLATE PRETZELS',
		brand: 'TORN & GLASSER',
		kind: 'branded',
		quality: 94,
		sources: 8,
		barcode: '00000000000011',
		alias: null
	},
	{
		id: 2,
		name: 'ORGANIC PLAIN WHOLE MILK YOGURT',
		brand: null,
		kind: 'branded',
		quality: 94,
		sources: 7,
		barcode: '00000000000028',
		alias: null
	},
	{
		id: 3,
		name: 'MILK',
		brand: 'NORTH VALLEY DAIRY',
		kind: 'branded',
		quality: 94,
		sources: 9,
		barcode: '00000000000035',
		alias: null
	},
	{
		id: 4,
		name: 'Milk, whole',
		brand: null,
		kind: 'generic',
		quality: 90,
		sources: 247,
		barcode: null,
		alias: 'whole milk'
	},
	// Same name as row 3 under another dairy: without the duplicate-name pass a
	// person searching "milk" sees one food twice.
	{
		id: 5,
		name: 'MILK',
		brand: 'WEST HILL',
		kind: 'branded',
		quality: 87,
		sources: 5,
		barcode: '00000000000059',
		alias: null
	},
	// A preserved form. Short, generic and high quality, so only the
	// processed-form penalty keeps it below plain milk.
	{
		id: 6,
		name: 'Milk, dried, whole',
		brand: null,
		kind: 'generic',
		quality: 91,
		sources: 2,
		barcode: null,
		alias: null
	},
	// Plural in the catalog, singular in the query.
	{
		id: 7,
		name: 'Bananas, raw',
		brand: null,
		kind: 'generic',
		quality: 91,
		sources: 1,
		barcode: null,
		alias: null
	},
	{
		id: 8,
		name: 'BANANA BREAD MIX',
		brand: "TRADER JOE'S",
		kind: 'branded',
		quality: 94,
		sources: 6,
		barcode: '00000000000080',
		alias: null
	},
	// A survey composite: generic like row 7, but below the reference tier.
	{
		id: 9,
		name: 'Banana, baked',
		brand: null,
		kind: 'generic',
		quality: 90,
		sources: 1,
		barcode: null,
		alias: null
	},
	// Two foods, one barcode: what `validate.py` reports 30 of.
	{
		id: 10,
		name: 'GRANOLA BAR, CHOCOLATE',
		brand: 'BRAND A',
		kind: 'branded',
		quality: 94,
		sources: 4,
		barcode: '00000000000103',
		alias: null
	},
	{
		id: 11,
		name: 'GRANOLA BAR, PEANUT',
		brand: 'BRAND B',
		kind: 'branded',
		quality: 87,
		sources: 3,
		barcode: '00000000000103',
		alias: null
	},
	// Found only through its alias, which is a separate FTS column.
	{
		id: 12,
		name: 'Cheese, curd',
		brand: null,
		kind: 'generic',
		quality: 91,
		sources: 1,
		barcode: null,
		alias: 'paneer'
	}
];

const SCHEMA = `
create table food (
	food_id bigint, gtin14 varchar, name varchar, brand varchar, category varchar,
	kind varchar, region varchar, license varchar, serving_label varchar, serving_g double,
	kcal double, protein double, fat double, carbs double, sugar double, fiber double,
	sodium double, saturated_fat double, quality bigint, n_sources bigint
);
create table food_alias (food_id bigint, alias varchar);
create unique index idx_food_id on food (food_id);
create index idx_food_gtin on food (gtin14);
create virtual table food_fts using fts5(
	name, brand, aliases, content='', tokenize='unicode61 remove_diacritics 2');
`;

/** The fixture as an open in-memory catalog, indexed the way the real file is. */
export function createFixtureCatalog(): DatabaseSync {
	const db = new DatabaseSync(':memory:');
	db.exec(SCHEMA);
	const food = db.prepare(
		`insert into food (food_id, gtin14, name, brand, category, kind, region, license,
			serving_label, serving_g, kcal, protein, fat, carbs, sugar, fiber, sodium,
			saturated_fat, quality, n_sources)
		values (?, ?, ?, ?, 'Test', ?, 'US', 'public-domain', 'serving', 100.0,
			100.0, 5.0, 3.0, 12.0, 4.0, 1.0, 50.0, 1.0, ?, ?)`
	);
	const alias = db.prepare('insert into food_alias (food_id, alias) values (?, ?)');
	const indexed = db.prepare(
		'insert into food_fts (rowid, name, brand, aliases) values (?, ?, ?, ?)'
	);
	for (const row of FIXTURE_FOODS) {
		food.run(row.id, row.barcode, row.name, row.brand, row.kind, row.quality, row.sources);
		if (row.alias !== null) alias.run(row.id, row.alias);
		indexed.run(row.id, row.name, row.brand ?? '', row.alias ?? '');
	}
	return db;
}
