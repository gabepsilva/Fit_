import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFixtureCatalog } from './fixture';
import { foodsByBarcode, pageSize, searchFoods } from './foods';

let db: DatabaseSync;

const names = (typed: string, limit = 10) => searchFoods(db, typed, limit).map((food) => food.name);

beforeEach(() => {
	db = createFixtureCatalog();
});

afterEach(() => {
	db.close();
});

describe('the defect this ranking exists for', () => {
	it('is reproduced by the fixture: quality alone answers "milk" with chocolate', () => {
		const byQuality = db
			.prepare(
				`select f.name from food_fts join food f on f.food_id = food_fts.rowid
				where food_fts match '"milk"*' order by f.quality desc limit 3`
			)
			.all()
			.map((row) => row['name']);
		expect(byQuality).toEqual([
			'TORN & GLASSER, MILK CHOCOLATE PRETZELS',
			'ORGANIC PLAIN WHOLE MILK YOGURT',
			'MILK'
		]);
	});
});

describe('searchFoods', () => {
	it('puts plain milk above milk chocolate pretzels', () => {
		expect(names('milk')).toEqual([
			'MILK',
			'Milk, whole',
			'Milk, dried, whole',
			'ORGANIC PLAIN WHOLE MILK YOGURT',
			'TORN & GLASSER, MILK CHOCOLATE PRETZELS'
		]);
	});

	it('shows one food per name, not the same food under five dairies', () => {
		expect(names('milk').filter((name) => name === 'MILK')).toHaveLength(1);
	});

	it('keeps the highest-quality row of a duplicated name', () => {
		const milk = searchFoods(db, 'milk', 10).find((food) => food.name === 'MILK');
		expect(milk?.brand).toBe('NORTH VALLEY DAIRY');
	});

	it('demotes a preserved form below the plain food', () => {
		const ranked = names('milk');
		expect(ranked.indexOf('Milk, dried, whole')).toBeGreaterThan(ranked.indexOf('Milk, whole'));
	});

	it('matches a plural catalog name from a singular query', () => {
		expect(names('banana')).toEqual(['Bananas, raw', 'Banana, baked', 'BANANA BREAD MIX']);
	});

	it('puts a reference food above a survey composite of the same head word', () => {
		const ranked = names('banana');
		expect(ranked.indexOf('Bananas, raw')).toBeLessThan(ranked.indexOf('Banana, baked'));
	});

	it('finds a food through an alias it is indexed under', () => {
		expect(names('paneer')).toEqual(['Cheese, curd']);
	});

	it('carries the provenance and the per-100 g numbers a logged entry keeps', () => {
		const [food] = searchFoods(db, 'paneer', 1);
		expect(food).toMatchObject({
			id: 12,
			name: 'Cheese, curd',
			brand: null,
			kind: 'generic',
			barcode: null,
			license: 'public-domain',
			serving: { label: 'serving', grams: 100 },
			per100g: { kcal: 100, protein: 5, fat: 3, carbs: 12 },
			quality: 91,
			sources: 1
		});
	});

	it('honours the requested page size', () => {
		expect(names('milk', 2)).toEqual(['MILK', 'Milk, whole']);
	});

	it('answers nothing for a query with no searchable token', () => {
		expect(searchFoods(db, 'a', 10)).toEqual([]);
	});

	it('answers nothing for a word the catalog does not hold', () => {
		expect(searchFoods(db, 'quinoa', 10)).toEqual([]);
	});
});

describe('pageSize', () => {
	it('defaults when nothing was asked for', () => {
		expect(pageSize(null)).toBe(20);
	});

	it('defaults for a size that is not a whole number of rows', () => {
		expect(pageSize('ten')).toBe(20);
		expect(pageSize('2.5')).toBe(20);
		expect(pageSize('0')).toBe(20);
		expect(pageSize('-5')).toBe(20);
	});

	it('caps a caller that asks for the whole catalog', () => {
		expect(pageSize('5000')).toBe(50);
	});

	it('honours a size within the cap', () => {
		expect(pageSize('7')).toBe(7);
	});
});

describe('foodsByBarcode', () => {
	it('returns the one food a barcode names', () => {
		expect(foodsByBarcode(db, '00000000000035').map((food) => food.name)).toEqual(['MILK']);
	});

	it('returns every food sharing a duplicated barcode rather than picking one', () => {
		expect(foodsByBarcode(db, '00000000000103').map((food) => food.name)).toEqual([
			'GRANOLA BAR, CHOCOLATE',
			'GRANOLA BAR, PEANUT'
		]);
	});

	it('returns nothing for a barcode the catalog does not carry', () => {
		expect(foodsByBarcode(db, '00000000009999')).toEqual([]);
	});
});
