import { describe, expect, it } from 'vitest';
import { bestFood, findFoods, guessMeal, hydrateProposal, parseLocalText } from './parse-text';
import type { QuantitySpec } from './quantity';
import type { Meal } from './types';

const ids = (query: string, limit?: number) => findFoods(query, limit).map((hit) => hit.food.id);

const scored = (query: string, limit?: number) =>
	findFoods(query, limit).map((hit) => [hit.food.id, hit.score]);

const firstItem = (text: string) => parseLocalText(text, 'lunch').items[0];

/** Hours either side of every boundary in `guessMeal`, plus the small hours. */
const MEAL_HOURS: [hour: number, meal: Meal][] = [
	[0, 'snack'],
	[4, 'snack'],
	[5, 'breakfast'],
	[9, 'breakfast'],
	[10, 'lunch'],
	[13, 'lunch'],
	[14, 'snack'],
	[16, 'snack'],
	[17, 'dinner'],
	[21, 'dinner'],
	[22, 'snack'],
	[23, 'snack']
];

type ParseCase = [text: string, servings: number, foodId: string, confidence: number];

const NUMBER_WORD_CASES: ParseCase[] = [
	['a banana', 1, 'banana', 1],
	['an apple', 1, 'apple', 1],
	['one banana', 1, 'banana', 1],
	['two eggs', 2, 'egg-large', 0.96],
	['three eggs', 3, 'egg-large', 0.96],
	['four eggs', 4, 'egg-large', 0.96],
	['five eggs', 5, 'egg-large', 0.96],
	['six eggs', 6, 'egg-large', 0.96],
	['seven eggs', 7, 'egg-large', 0.96],
	['eight eggs', 8, 'egg-large', 0.96],
	['nine eggs', 9, 'egg-large', 0.96],
	['ten almonds', 10, 'almonds', 0.96],
	['half avocado', 0.5, 'avocado', 1],
	['dozen eggs', 12, 'egg-large', 0.96]
];

// '×' is the multiplication sign, which people get from a phone keyboard.
const WRITTEN_NUMBER_CASES: ParseCase[] = [
	['1/2 avocado', 0.5, 'avocado', 1],
	['1/ 2 avocado', 0.5, 'avocado', 1],
	['1 /2 avocado', 0.5, 'avocado', 1],
	['0.5 avocado', 0.5, 'avocado', 1],
	['2 x eggs', 2, 'egg-large', 0.96],
	['2 × eggs', 2, 'egg-large', 0.96],
	['2x eggs', 2, 'egg-large', 0.96],
	['12.5 x brown rice', 12.5, 'brown-rice', 0.96]
];

const GLUED_UNIT_CASES: ParseCase[] = [
	// 195 g a serving, so 150 g is a bit over three quarters of one.
	['150g brown rice', 0.77, 'brown-rice', 0.96],
	// 28 g a serving.
	['12.5g almonds', 0.45, 'almonds', 0.96],
	// 8 oz is 226.8 g against a 100 g serving.
	['8oz salmon', 2.27, 'salmon', 0.96],
	['1cup oats', 1, 'oats', 0.96],
	['1slice toast', 1, 'sourdough', 0.96],
	['2slices toast', 2, 'sourdough', 0.96],
	// Issue #111: a long spelling glued to the number reads the same unit as
	// its short form.
	['2tablespoons peanut butter', 1, 'peanut-butter', 0.96],
	// The period in "tbsp." has to be escaped before it joins the alternation
	// regex, or a mutant that drops it instead of escaping it would fail to
	// glue "tbsp." at all, falling back to one bare serving instead of the 1.5
	// servings three tablespoons of a 2-tbsp serving actually comes to.
	['3tbsp. peanut butter', 1.5, 'peanut-butter', 0.96]
];

/** One phrase per unit word the parser drops before it searches the catalog. */
const UNIT_WORD_CASES: ParseCase[] = [
	['2 large eggs', 2, 'egg-large', 0.96],
	['1 medium banana', 1, 'banana', 1],
	['1 small apple', 1, 'apple', 1],
	['1 slice sourdough', 1, 'sourdough', 0.96],
	['2 slices toast', 2, 'sourdough', 0.96],
	['1 cup oats', 1, 'oats', 0.96],
	// A serving of brown rice is one cup, so two cups is two servings (#94).
	['2 cups brown rice', 2, 'brown-rice', 0.96],
	['2 tbsp peanut butter', 1, 'peanut-butter', 0.96],
	// Issue #111: the long spelling, its plural, and any case must read the
	// same volume unit as the short form above.
	['2 tablespoons peanut butter', 1, 'peanut-butter', 0.96],
	['2 Tablespoons peanut butter', 1, 'peanut-butter', 0.96],
	['2 tbsp. peanut butter', 1, 'peanut-butter', 0.96],
	['1 tsp honey', 1, 'honey', 1],
	['1 teaspoon honey', 1, 'honey', 1],
	['250 ml milk', 1, 'whole-milk', 0.96],
	['250 millilitres milk', 1, 'whole-milk', 0.96],
	['1 scoop whey', 1, 'whey', 0.96],
	['2 scoops whey', 2, 'whey', 0.96],
	['1 can tuna', 1, 'tuna-canned', 0.96],
	['2 cans tuna', 2, 'tuna-canned', 0.96],
	['1 bar dark chocolate', 1, 'dark-chocolate', 0.96],
	['1 bowl oats', 1, 'oats', 0.96],
	['1 piece salmon', 1, 'salmon', 0.96],
	['2 pieces salmon', 2, 'salmon', 0.96],
	['4 oz salmon', 1.13, 'salmon', 0.96],
	['150 g brown rice', 0.77, 'brown-rice', 0.96],
	['150 grams brown rice', 0.77, 'brown-rice', 0.96],
	['1 gram honey', 0.05, 'honey', 1]
];

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
		expect(findFoods('gg')).toEqual([]);
	});

	it('matches on the brand as well as on the name and the aliases', () => {
		expect(scored('general mills cereal', 3)).toEqual([['cheerios', 1]]);
	});

	it('splits a possessive brand at its apostrophe, so a query without one only partly matches', () => {
		expect(scored('mcdonalds egg mcmuffin', 1)).toEqual([['egg-mcmuffin', 2 / 3]]);
	});

	it('falls back to the share of the query words an entry uses', () => {
		expect(scored('egg toast', 3)).toEqual([
			['egg-large', 0.5],
			['egg-white', 0.5],
			['sourdough', 0.5]
		]);
	});

	it('credits a query word that only appears inside a longer catalog word', () => {
		expect(scored('grill chicken', 3)).toEqual([
			['chicken-breast', 1],
			['chicken-thigh', 0.5],
			['rotisserie-chicken', 0.5]
		]);
	});

	it('needs a query word longer than three characters before matching it inside another word', () => {
		expect(ids('oat toast')).toEqual(['sourdough', 'wheat-bread', 'oatly']);
	});

	it('drops an entry that accounts for only a quarter of the query', () => {
		expect(findFoods('rice with soy sauce')).toEqual([]);
	});

	it('respects the result limit', () => {
		expect(findFoods('egg toast').length).toBeGreaterThan(3);
		expect(findFoods('egg toast', 3)).toHaveLength(3);
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
		expect(scored('chocolate')).toEqual([
			['dark-chocolate', 0.96],
			['kind-bar', 0.86],
			['quest-bar', 0.86]
		]);
	});
});

describe('bestFood', () => {
	it('returns the single strongest match', () => {
		const hit = bestFood('chicken breast');
		expect(hit?.food.id).toBe('chicken-breast');
		expect(hit?.score).toBe(0.96);
	});

	it('returns null when nothing scores above the threshold', () => {
		expect(bestFood('qqqzzz')).toBeNull();
	});
});

describe('guessMeal', () => {
	it.each(MEAL_HOURS)('calls %i:00 %s', (hour, meal) => {
		expect(guessMeal(new Date(2026, 0, 1, hour))).toBe(meal);
	});
});

describe('parseLocalText', () => {
	it.each(NUMBER_WORD_CASES)(
		'reads "%s" as %d serving(s) of %s',
		(text, servings, foodId, confidence) => {
			const item = firstItem(text);
			expect(item?.servings).toBe(servings);
			expect(item?.foodId).toBe(foodId);
			expect(item?.confidence).toBe(confidence);
		}
	);

	it.each(WRITTEN_NUMBER_CASES)(
		'reads "%s" as %d serving(s) of %s',
		(text, servings, foodId, confidence) => {
			const item = firstItem(text);
			expect(item?.servings).toBe(servings);
			expect(item?.foodId).toBe(foodId);
			expect(item?.confidence).toBe(confidence);
		}
	);

	it.each(GLUED_UNIT_CASES)(
		'reads "%s", with the unit glued to the number, as %d serving(s) of %s',
		(text, servings, foodId, confidence) => {
			const item = firstItem(text);
			expect(item?.servings).toBe(servings);
			expect(item?.foodId).toBe(foodId);
			expect(item?.confidence).toBe(confidence);
		}
	);

	it.each(UNIT_WORD_CASES)(
		'reads the unit word in "%s" and logs %d serving(s) of %s',
		(text, servings, foodId, confidence) => {
			const item = firstItem(text);
			expect(item?.servings).toBe(servings);
			expect(item?.foodId).toBe(foodId);
			expect(item?.confidence).toBe(confidence);
		}
	);

	it('defaults to a single serving when no quantity is given', () => {
		const item = firstItem('coffee');
		expect(item?.servings).toBe(1);
		expect(item?.foodId).toBe('coffee');
		expect(item?.confidence).toBe(0.96);
	});

	it('drops a leading "of" before reading the quantity', () => {
		const item = firstItem('of two eggs');
		expect(item?.servings).toBe(2);
		expect(item?.foodId).toBe('egg-large');
	});

	it('drops the unit and the "of" between a quantity and its food', () => {
		const item = firstItem('2 slices of toast');
		expect(item?.servings).toBe(2);
		expect(item?.foodId).toBe('sourdough');
		// The whole query is now the alias, so it can't scrape past on a partial match.
		expect(item?.confidence).toBe(0.96);
	});

	it('reads a number only at the start of a phrase, not in the middle of one', () => {
		const item = firstItem('rice 2 cups');
		expect(item?.servings).toBe(1);
		expect(item?.foodId).toBeNull();
	});

	it('reads a fraction only at the start of a phrase, not in the middle of one', () => {
		const item = firstItem('rice 1/2 cup');
		expect(item?.servings).toBe(1);
		expect(item?.foodId).toBeNull();
	});

	it('refuses a fraction that divides by zero rather than proposing endless servings', () => {
		const item = firstItem('1/0 avocado');
		expect(item?.servings).toBe(1);
		expect(item?.foodId).toBeNull();
	});

	it('splits a sentence on commas into separate items', () => {
		expect(parseLocalText('two eggs, black coffee').items.map((i) => i.foodId)).toEqual([
			'egg-large',
			'coffee'
		]);
	});

	it('splits on the word "and"', () => {
		expect(parseLocalText('eggs and coffee').items.map((i) => i.foodId)).toEqual([
			'egg-large',
			'coffee'
		]);
	});

	it('splits on a semicolon and on a plus', () => {
		expect(parseLocalText('coffee; toast + eggs').items.map((i) => i.foodId)).toEqual([
			'coffee',
			'sourdough',
			'egg-large'
		]);
	});

	it('splits on a slash between words but keeps one between digits as a fraction', () => {
		const { items } = parseLocalText('1/2 avocado, eggs / toast');
		expect(items.map((i) => i.foodId)).toEqual(['avocado', 'egg-large', 'sourdough']);
		expect(items.map((i) => i.servings)).toEqual([0.5, 1, 1]);
	});

	it('splits even when the separator has no space after it', () => {
		expect(parseLocalText('eggs,toast').items.map((i) => i.foodId)).toEqual([
			'egg-large',
			'sourdough'
		]);
	});

	it('drops the empty fragment a doubled separator leaves behind', () => {
		expect(parseLocalText('two eggs,, toast').items.map((i) => i.foodId)).toEqual([
			'egg-large',
			'sourdough'
		]);
	});

	it('drops a one-letter fragment, trailing space and all', () => {
		expect(parseLocalText('two eggs, a ').items.map((i) => i.foodId)).toEqual(['egg-large']);
	});

	it('assigns the requested meal to every item', () => {
		const { items } = parseLocalText('eggs, coffee', 'dinner');
		expect(items.map((i) => i.meal)).toEqual(['dinner', 'dinner']);
	});

	it('reports unmatched text rather than dropping it, and keeps a proposal with no food', () => {
		const result = parseLocalText('xyzzy nonexistent gruel');
		expect(result.allMatched).toBe(false);
		expect(result.unmatched).toEqual(['xyzzy nonexistent gruel']);
		expect(result.items[0]?.foodId).toBeNull();
		expect(result.items[0]?.name).toBe('xyzzy nonexistent gruel');
		expect(result.items[0]?.confidence).toBe(0);
	});

	it('reads through the article in "half an avocado"', () => {
		const result = parseLocalText('half an avocado');
		expect(result.allMatched).toBe(true);
		expect(result.items[0]?.foodId).toBe('avocado');
		expect(result.items[0]?.servings).toBe(0.5);
	});

	it('reads through the unit and the "of" in "a cup of coffee"', () => {
		const result = parseLocalText('a cup of coffee');
		expect(result.allMatched).toBe(true);
		expect(result.items[0]?.foodId).toBe('coffee');
		expect(result.items[0]?.servings).toBe(1);
	});

	it('accepts a match scoring exactly at the threshold, not just above it', () => {
		// Eleven of twenty words name the food: 11/20 is the 0.55 threshold itself.
		const repeat = (word: string, times: number) => Array.from({ length: times }, () => word);
		const words = [...repeat('chicken', 11), ...repeat('zebra', 9)].join(' ');
		const item = parseLocalText(words, 'lunch').items[0];
		expect(item?.confidence).toBe(0.55);
		expect(item?.foodId).toBe('chicken-breast');
	});

	it('is not "all matched" when there is nothing to match', () => {
		const result = parseLocalText('');
		expect(result.items).toEqual([]);
		expect(result.allMatched).toBe(false);
	});

	it('marks a sentence it fully understands as all matched', () => {
		const result = parseLocalText('chicken breast, brown rice');
		expect(result.allMatched).toBe(true);
		expect(result.unmatched).toEqual([]);
		expect(result.items.map((i) => i.foodId)).toEqual(['chicken-breast', 'brown-rice']);
		expect(result.items.map((i) => i.confidence)).toEqual([0.96, 0.96]);
	});
});

describe('parseLocalText quantities', () => {
	const quantityOf = (text: string) => firstItem(text)?.quantity;

	it.each([
		['200 g chicken breast', 2, 'chicken-breast'],
		['200g chicken breast', 2, 'chicken-breast'],
		['1 kg chicken breast', 10, 'chicken-breast'],
		// A 244 g serving of milk, so 200 g is a little over four fifths.
		['200 g milk', 0.82, 'whole-milk'],
		// 1 lb is 453.59 g against a 100 g serving.
		['1 lb salmon', 4.54, 'salmon'],
		['16 ounces salmon', 4.54, 'salmon']
	])(
		'resolves the mass in "%s" against the food\u2019s own serving weight',
		(text, servings, id) => {
			const item = firstItem(text);
			expect(item?.foodId).toBe(id);
			expect(item?.servings).toBe(servings);
		}
	);

	it('keeps the mass it read, so a matcher can resolve it later', () => {
		expect(quantityOf('200 g chicken breast')).toEqual<QuantitySpec>({
			amount: 200,
			unit: 'g',
			kind: 'mass'
		});
	});

	it.each([
		// Whole milk is "1 cup", 244 g; brown rice "1 cup", 195 g; peanut butter
		// "2 tbsp", 32 g. Each food's own label says what one of its units weighs.
		['2 cups milk', 'cups', 'whole-milk', 2],
		['2 cups brown rice', 'cups', 'brown-rice', 2],
		['2 tbsp peanut butter', 'tbsp', 'peanut-butter', 1],
		['1 tbsp peanut butter', 'tbsp', 'peanut-butter', 0.5]
	])('reads the volume in "%s" off the food itself', (text, unit, id, servings) => {
		const item = firstItem(text);
		expect(item?.foodId).toBe(id);
		expect(item?.servings).toBe(servings);
		expect(item?.quantity?.unit).toBe(unit);
		expect(item?.quantity?.kind).toBe('volume');
	});

	it.each([
		// Oats are "1/2 cup dry": a label that does not state a volume outright is
		// not read for one. Milk is "1 cup", which says nothing about millilitres.
		['3/4 cup oats', 'cup', 'oats'],
		['250 ml milk', 'ml', 'whole-milk'],
		['1 tsp milk', 'tsp', 'whole-milk']
	])(
		'records one serving for the volume in "%s" rather than inventing a number',
		(text, unit, id) => {
			const item = firstItem(text);
			expect(item?.foodId).toBe(id);
			expect(item?.servings).toBe(1);
			expect(item?.quantity?.unit).toBe(unit);
			expect(item?.quantity?.kind).toBe('volume');
		}
	);

	it.each([
		['200 G chicken breast', 2, 'chicken-breast'],
		['150G brown rice', 0.77, 'brown-rice']
	])('reads the unit in "%s" whatever case it was typed in', (text, servings, id) => {
		const item = firstItem(text);
		expect(item?.foodId).toBe(id);
		expect(item?.servings).toBe(servings);
		expect(item?.quantity?.kind).toBe('mass');
	});

	it('keeps the unit lowercased, however it was typed', () => {
		expect(quantityOf('200 G chicken breast')?.unit).toBe('g');
		expect(quantityOf('150g brown rice')).toEqual<QuantitySpec>({
			amount: 150,
			unit: 'g',
			kind: 'mass'
		});
	});

	it('leaves a bare number meaning servings', () => {
		expect(quantityOf('two eggs')).toEqual<QuantitySpec>({ amount: 2, unit: '', kind: 'serving' });
		expect(firstItem('two eggs')?.servings).toBe(2);
	});

	it('leaves a per-item unit meaning servings', () => {
		expect(quantityOf('2 slices of toast')).toEqual<QuantitySpec>({
			amount: 2,
			unit: '',
			kind: 'serving'
		});
		expect(firstItem('2 slices of toast')?.servings).toBe(2);
	});

	it('will not read the last word left in a phrase as a unit', () => {
		const item = firstItem('3 cups');
		expect(item?.servings).toBe(3);
		expect(item?.quantity).toEqual<QuantitySpec>({ amount: 3, unit: '', kind: 'serving' });
	});

	it('reads no unit from a phrase that leads with none', () => {
		expect(quantityOf('coffee')).toEqual<QuantitySpec>({ amount: 1, unit: '', kind: 'serving' });
	});

	it('reads no unit from a leading fraction', () => {
		expect(quantityOf('1/2 avocado')).toEqual<QuantitySpec>({
			amount: 0.5,
			unit: '',
			kind: 'serving'
		});
	});

	it('records one serving for a mass it has no catalog food to weigh', () => {
		const item = firstItem('200 g xyzzy gruel');
		expect(item?.foodId).toBeNull();
		expect(item?.servings).toBe(1);
		expect(item?.quantity).toEqual<QuantitySpec>({ amount: 200, unit: 'g', kind: 'mass' });
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
		expect(hydrated.name).toBe('Chicken breast, grilled');
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
