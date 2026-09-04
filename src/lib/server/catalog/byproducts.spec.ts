import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { BYPRODUCT_PARTS, byproductSql, namePartsSql } from './byproducts.ts';

/** One name through the two expressions, with `:text` bound to what was typed. */
function evaluate(name: string, typed: string): { parts: string; demoted: boolean } {
	const db = new DatabaseSync(':memory:');
	try {
		db.exec('create table food (name text)');
		db.prepare('insert into food (name) values (?)').run(name);
		const row = db
			.prepare(
				`select name_parts, case when ${byproductSql('name_parts')} then 1 else 0 end as demoted
				from (select ${namePartsSql('name')} as name_parts from food)`
			)
			.get({ text: typed });
		return { parts: String(row?.['name_parts']), demoted: row?.['demoted'] === 1 };
	} finally {
		db.close();
	}
}

const parts = (name: string) => evaluate(name, 'nothing').parts;
const demoted = (name: string, typed: string) => evaluate(name, typed).demoted;

describe('namePartsSql', () => {
	it('fences every comma-separated part of a lowercased name', () => {
		expect(parts('Chicken, feet, boiled')).toBe(',chicken,feet,boiled,');
	});

	it('fences a name that has no parts at all', () => {
		expect(parts('MILK')).toBe(',milk,');
	});

	it('folds the space a name puts before its comma, which 896 catalog rows do', () => {
		expect(parts(' Pork , tail , raw ')).toBe(',pork,tail,raw,');
	});
});

/**
 * One catalog name per word, so a word that stops matching fails on its own row
 * rather than hiding behind another word in the same list.
 */
const PART_ROWS: [word: string, name: string, typed: string][] = [
	['blood', 'Game meat, Indigenous, moose, blood, raw', 'moose'],
	['bones', 'Pork, bones', 'pork'],
	['bone marrow', 'Game meat, Indigenous, caribou (reindeer), bone marrow, raw', 'caribou'],
	['brain', 'Veal, brain, braised', 'veal'],
	['brains', 'Pork, brains, raw', 'pork'],
	['chitterlings', 'Pork, fresh, variety meats and by-products, chitterlings, raw', 'pork'],
	['ears', 'Pork, ears, frozen, raw', 'pork'],
	['fat', 'Beef, fat, raw', 'beef'],
	['feet', 'Chicken, feet, boiled', 'chicken'],
	['giblets', 'Turkey, all classes, giblets, raw', 'turkey'],
	['gizzard', 'Chicken, broiler, gizzard, raw', 'chicken'],
	['heart', 'Beef, heart, raw', 'beef'],
	['jowl', 'Pork, jowl, raw', 'pork'],
	['kidney', 'Veal, kidney, braised', 'veal'],
	['kidneys', 'Beef, kidneys, raw', 'beef'],
	['leaf fat', 'Pork, leaf fat, raw', 'pork'],
	['leaves', 'Broccoli, leaves, raw', 'broccoli'],
	['liver', 'Pork, liver, raw', 'pork'],
	['livers', 'Livers, chicken, chopped, with eggs and onion', 'chicken'],
	['lung', 'Game meat, Indigenous, moose, lung, raw', 'moose'],
	['lungs', 'Pork, lungs, raw', 'pork'],
	['neck', 'Turkey, all classes, neck, meat only, raw', 'turkey'],
	['pancreas', 'Pork, pancreas, braised', 'pork'],
	['skin', 'Potato, skin, raw', 'potato'],
	['spleen', 'Pork, spleen, braised', 'pork'],
	['stalks', 'Broccoli, stalks, raw', 'broccoli'],
	['stomach', 'Pork, stomach, raw', 'pork'],
	['suet', 'Beef, suet, raw', 'beef'],
	['sweetbread', 'Beef, New Zealand, imported, sweetbread, raw', 'beef'],
	['sweetbreads', 'Sweetbreads', 'beef'],
	['tail', 'Pork, tail, raw', 'pork'],
	['testes', 'Lamb, New Zealand, imported, testes, raw', 'lamb'],
	['thymus', 'Veal, thymus, raw', 'veal'],
	['tongue', 'Pork, tongue, raw', 'pork'],
	['tripe', 'Beef, tripe, raw', 'beef']
];

describe('byproductSql', () => {
	it.each(PART_ROWS)('demotes %s: "%s" for a search of "%s"', (_word, name, typed) => {
		expect(demoted(name, typed)).toBe(true);
	});

	it('covers every word in the list, so a word added without a row is caught', () => {
		expect(PART_ROWS.map(([word]) => word).sort()).toEqual([...BYPRODUCT_PARTS].sort());
	});

	// Each of these is a real catalog row that a substring match would demote,
	// and each is the food a person asking for that word most likely means.
	it('leaves a boneless skinless breast alone', () => {
		expect(demoted('Chicken, breast, boneless, skinless, raw', 'chicken')).toBe(false);
	});

	it('leaves an apple that is merely sold with its skin alone', () => {
		expect(demoted('Apples, fuji, with skin, raw', 'apple')).toBe(false);
	});

	it('leaves a potato that is flesh and skin together alone', () => {
		expect(demoted('Potato, flesh and skin, raw', 'potato')).toBe(false);
	});

	it('leaves a bone-in chop alone', () => {
		expect(demoted('Pork, loin, centre cut (centre chop), bone-in, lean, raw', 'pork')).toBe(false);
	});

	it('leaves a milk whose part reads "2% fat" alone', () => {
		expect(demoted('Milk, evaporated, 2% fat, with added vitamin A and vitamin D', 'milk')).toBe(
			false
		);
	});

	it('leaves a cheese whose part merely contains "fat" alone', () => {
		expect(demoted('Cheese, cheddar, nonfat or fat free', 'cheddar')).toBe(false);
	});

	it('leaves a fruit cocktail alone', () => {
		expect(demoted('Fruit cocktail, canned, heavy syrup pack, solids and liquids', 'fruit')).toBe(
			false
		);
	});

	it('does not demote a part the person asked for', () => {
		expect(demoted('Chicken, feet, boiled', 'chicken feet')).toBe(false);
		expect(demoted('Beef, liver, raw', 'beef liver')).toBe(false);
	});

	it('reads the query a word at a time, so "skinless" does not exempt "skin"', () => {
		expect(demoted('Potato, skin, raw', 'skinless potato')).toBe(true);
	});
});
