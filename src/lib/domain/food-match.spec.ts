import { describe, expect, it } from 'vitest';
import { findFoods } from './food-match';

const ids = (query: string, limit?: number) => findFoods(query, limit).map((hit) => hit.food.id);

const scored = (query: string, limit?: number) =>
	findFoods(query, limit).map((hit) => [hit.food.id, hit.score]);

describe('findFoods', () => {
	it('scores an exact catalog name above everything else', () => {
		expect(scored('avocado')).toEqual([['avocado', 1]]);
	});

	it('scores an exact alias just below an exact name', () => {
		expect(scored('eggs')).toEqual([['egg-large', 0.96]]);
	});

	it('scores a fragment found inside the catalog text below an alias', () => {
		expect(scored('coff')).toEqual([['coffee', 0.86]]);
	});

	it('ignores a fragment of two characters or fewer', () => {
		// "gg" is inside "eggs", so only the length test keeps it from scoring 0.86.
		expect(findFoods('gg')).toEqual([]);
	});

	it('matches on the brand as well as on the name and the aliases', () => {
		// "mcdonald" appears in this row's brand and nowhere in its name or aliases.
		expect(scored('mcdonald mcmuffin', 3)).toEqual([['egg-mcmuffin', 1]]);
	});

	it('joins the name, the brand and the aliases with one space each', () => {
		// A query that runs from the end of the name into the first alias. It only
		// reads as a fragment of the food's text if the parts are joined by single
		// spaces and a food with no brand leaves no gap between them. Egg is
		// brandless, and its first alias follows its name.
		expect(scored('large eggs', 3)).toEqual([['egg-large', 0.86]]);
	});

	it('splits a possessive brand at its apostrophe, so a query without one only partly matches', () => {
		expect(scored('mcdonalds egg mcmuffin', 1)).toEqual([['egg-mcmuffin', 2 / 3]]);
	});

	it('falls back to the share of the query words an entry uses', () => {
		expect(scored('egg toast', 3)).toEqual([
			['egg-large', 0.5],
			['sourdough', 0.5],
			['wheat-bread', 0.5]
		]);
	});

	it('credits a query word that only appears inside a longer catalog word', () => {
		// "grill" is inside "grilled"; nothing in the catalog is named "grill".
		expect(scored('grill chicken', 3)).toEqual([
			['chicken-breast', 1],
			['chipotle-bowl', 0.5]
		]);
	});

	it('needs a query word longer than three characters before matching it inside another word', () => {
		expect(ids('oat toast')).toEqual(['sourdough', 'wheat-bread', 'oatly']);
	});

	it('drops an entry that accounts for only a quarter of the query', () => {
		// Brown rice answers one of these four words: 0.25 is the threshold itself.
		expect(findFoods('rice with soy sauce')).toEqual([]);
	});

	it('scores nothing for a query with no words in it at all', () => {
		expect(findFoods('!!!')).toEqual([]);
	});

	it('respects the result limit', () => {
		expect(findFoods('egg toast').length).toBeGreaterThan(3);
		expect(findFoods('egg toast', 3)).toHaveLength(3);
	});

	it('offers a dozen results by default', () => {
		expect(findFoods('')).toHaveLength(12);
	});

	it('offers a starter list for an empty query, so the search is never blank', () => {
		const starters = findFoods('', 5);
		expect(starters).toHaveLength(5);
		expect(starters.map((hit) => hit.score)).toEqual([0, 0, 0, 0, 0]);
		expect(starters[0]?.food.id).toBe('egg-large');
	});

	it('treats a query of nothing but spaces as an empty one', () => {
		expect(findFoods('   ', 5)).toHaveLength(5);
	});

	it('returns results ordered by descending score', () => {
		expect(scored('chicken', 3)).toEqual([
			['chicken-breast', 0.96],
			['chipotle-bowl', 0.86]
		]);
	});
});
