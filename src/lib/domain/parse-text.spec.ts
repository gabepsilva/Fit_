import { describe, expect, it } from 'vitest';
import { bestFood, findFoods, guessMeal, hydrateProposal, parseLocalText } from './parse-text';

describe('findFoods', () => {
	it('finds a food by its exact name', () => {
		expect(findFoods('egg')[0]?.food.id).toBeTruthy();
	});

	it('respects the result limit', () => {
		expect(findFoods('c', 3).length).toBeLessThanOrEqual(3);
	});

	it('offers a starter list for an empty query, so the search is never blank', () => {
		expect(findFoods('', 5).length).toBe(5);
	});

	it('returns results ordered by descending score', () => {
		const scores = findFoods('chicken', 5).map((r) => r.score);
		expect([...scores].sort((a, b) => b - a)).toEqual(scores);
	});
});

describe('bestFood', () => {
	it('returns the single strongest match', () => {
		expect(bestFood('chicken breast')?.food.id).toBe('chicken-breast');
	});

	it('returns null when nothing scores above the threshold', () => {
		expect(bestFood('qqqzzz')).toBeNull();
	});
});

describe('guessMeal', () => {
	it('calls the early morning breakfast', () => {
		expect(guessMeal(new Date(2026, 0, 1, 7))).toBe('breakfast');
	});

	it('calls midday lunch', () => {
		expect(guessMeal(new Date(2026, 0, 1, 12))).toBe('lunch');
	});

	it('calls the afternoon a snack', () => {
		expect(guessMeal(new Date(2026, 0, 1, 15))).toBe('snack');
	});

	it('calls the evening dinner', () => {
		expect(guessMeal(new Date(2026, 0, 1, 19))).toBe('dinner');
	});

	it('calls the small hours a snack', () => {
		expect(guessMeal(new Date(2026, 0, 1, 2))).toBe('snack');
	});
});

describe('parseLocalText', () => {
	it('splits a sentence on commas into separate items', () => {
		expect(parseLocalText('two eggs, black coffee').items.length).toBe(2);
	});

	it('splits on the word "and"', () => {
		expect(parseLocalText('eggs and coffee').items.length).toBe(2);
	});

	it('reads a spelled-out quantity', () => {
		expect(parseLocalText('two eggs').items[0]?.servings).toBe(2);
	});

	it('reads a numeric quantity', () => {
		expect(parseLocalText('3 eggs').items[0]?.servings).toBe(3);
	});

	it('reads a fractional quantity', () => {
		expect(parseLocalText('1/2 avocado').items[0]?.servings).toBe(0.5);
	});

	it('reads a gram-glued quantity', () => {
		expect(parseLocalText('150g brown rice').items[0]?.servings).toBe(150);
	});

	it('defaults to a single serving when no quantity is given', () => {
		expect(parseLocalText('coffee').items[0]?.servings).toBe(1);
	});

	it('assigns the requested meal to every item', () => {
		const { items } = parseLocalText('eggs, coffee', 'dinner');
		expect(items.every((i) => i.meal === 'dinner')).toBe(true);
	});

	it('reports unmatched text rather than dropping it', () => {
		const result = parseLocalText('xyzzy nonexistent gruel');
		expect(result.allMatched).toBe(false);
		expect(result.unmatched.length).toBeGreaterThan(0);
	});

	it('still returns an item for unmatched text, with a null foodId', () => {
		const item = parseLocalText('xyzzy nonexistent gruel').items[0];
		expect(item?.foodId).toBeNull();
	});

	it('is not "all matched" when there is nothing to match', () => {
		expect(parseLocalText('').allMatched).toBe(false);
	});

	it('marks a sentence it fully understands as all matched', () => {
		expect(parseLocalText('chicken breast, brown rice').allMatched).toBe(true);
	});
});

describe('hydrateProposal', () => {
	it('fills the catalog name in for a matched proposal', () => {
		const hydrated = hydrateProposal({
			foodId: 'chicken-breast',
			query: 'chicken',
			name: 'chicken',
			servings: 1,
			meal: 'lunch',
			confidence: 0.9
		});
		expect(hydrated.name).not.toBe('chicken');
	});

	it('leaves an unmatched proposal untouched', () => {
		const proposal = {
			foodId: null,
			query: 'gruel',
			name: 'gruel',
			servings: 1,
			meal: 'lunch' as const,
			confidence: 0
		};
		expect(hydrateProposal(proposal)).toEqual(proposal);
	});

	it('leaves a proposal pointing at an unknown food untouched', () => {
		const proposal = {
			foodId: 'not-in-catalog',
			query: 'gruel',
			name: 'gruel',
			servings: 1,
			meal: 'lunch' as const,
			confidence: 0.9
		};
		expect(hydrateProposal(proposal)).toEqual(proposal);
	});
});
