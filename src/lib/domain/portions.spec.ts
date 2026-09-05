import { describe, expect, it } from 'vitest';
import {
	UNIT_ML,
	gramsPerVolumeUnit,
	parsePortionLabel,
	volumeUnit,
	withVolumeHint
} from './portions';

describe('UNIT_ML', () => {
	it.each([
		['tsp', 5],
		['tbsp', 15],
		['cup', 240],
		['ml', 1],
		['l', 1000]
	])('holds the nutrition-label millilitres of a %s', (unit, ml) => {
		expect(UNIT_ML[unit as keyof typeof UNIT_ML]).toBe(ml);
	});
});

// Every accepted spelling is read back through `volumeUnit` in
// `unit-spellings.spec.ts`, which loops `UNIT_SPELLING_WORDS` itself and so
// cannot fall behind the table. What is left here is the behavior that table
// does not state: casing, surrounding space, and what is refused.
describe('volumeUnit', () => {
	it('reads a unit whatever its case, and around the spaces a label leaves', () => {
		expect(volumeUnit('Tbsp')).toBe('tbsp');
		expect(volumeUnit('CUP')).toBe('cup');
		expect(volumeUnit(' tsp ')).toBe('tsp');
	});

	it.each(['g', 'oz', 'slice', 'bottle', 'cupcake', 'cupcakes', ''])(
		'refuses "%s", which measures no volume',
		(word) => {
			expect(volumeUnit(word)).toBeNull();
		}
	);

	it('refuses an inherited property name rather than answering with one', () => {
		expect(volumeUnit('constructor')).toBeNull();
		expect(volumeUnit('toString')).toBeNull();
	});
});

describe('parsePortionLabel', () => {
	it.each([
		// label, the weight the catalog gives that whole label, grams in one unit
		['1 tbsp', 14, 'tbsp', 14],
		['1 Tbsp', 14, 'tbsp', 14],
		['2 Tbsp', 32, 'tbsp', 16],
		['3 Tbsp', 30, 'tbsp', 10],
		['1 tsp', 4, 'tsp', 4],
		['1 cup', 244, 'cup', 244],
		['1.0 cup', 244, 'cup', 244],
		['0.5 cup', 122, 'cup', 244],
		['1/2 cup', 122, 'cup', 244],
		['1/4 cup', 61, 'cup', 244],
		['2/3 cup', 160, 'cup', 240],
		['1 1/2 cup', 366, 'cup', 244],
		['250 ml', 250, 'ml', 1],
		['1 l', 1000, 'l', 1000]
	])('reads "%s" weighing %d g as %s g in one %s', (label, grams, unit, perUnit) => {
		expect(parsePortionLabel(label, grams)).toEqual({ unit, grams: perUnit });
	});

	it('reads a label the catalog padded with spaces', () => {
		expect(parsePortionLabel('  1 cup  ', 244)).toEqual({ unit: 'cup', grams: 244 });
	});

	it('reads a parenthetical the catalog left no space before', () => {
		// "2 cups(30g)" and "1/2cup(49g)" are both in the shipped catalog.
		expect(parsePortionLabel('2 cups(30 g)', 30)).toEqual({ unit: 'cup', grams: 15 });
	});

	it('reads through the parenthetical a label carries', () => {
		expect(parsePortionLabel('1 Tbsp (15 ml)', 13.5)).toEqual({ unit: 'tbsp', grams: 13.5 });
		expect(parsePortionLabel('2 tbsp (30 g)', 30)).toEqual({ unit: 'tbsp', grams: 15 });
		expect(parsePortionLabel('1 cup (240 ml)', 240)).toEqual({ unit: 'cup', grams: 240 });
	});

	it.each([
		// The reject list issue #94 set: a label that says anything beyond
		// "<count> <volume unit>" is not the food's stated volume.
		['170 g cup', 170],
		['1/2 cup dry', 40],
		['1 oz (23 nuts)', 28],
		['1 bottle (414 ml)', 414],
		['1 PUDDING CUP', 99],
		['1 SINGLE SERVE CUP', 99],
		['3 CUPCAKES', 150],
		['100 g', 100],
		['1 large', 50],
		['cup', 240],
		['', 100],
		['1 cup dry (140 g)', 140],
		// The volume has to lead the label, not appear somewhere inside it.
		['about 1 cup', 244],
		['1/2cup(49g)', 49]
	])('refuses "%s", which does not state a volume outright', (label, grams) => {
		expect(parsePortionLabel(label, grams)).toBeNull();
	});

	it.each([
		['zero', 0],
		['negative', -244],
		['not a number', Number.NaN],
		['infinite', Number.POSITIVE_INFINITY]
	])('refuses a label whose weight is %s', (_name, grams) => {
		expect(parsePortionLabel('1 cup', grams)).toBeNull();
	});

	it('refuses a count of zero rather than answering with an endless weight', () => {
		expect(parsePortionLabel('0 cup', 244)).toBeNull();
		expect(parsePortionLabel('1/0 cup', 244)).toBeNull();
	});

	it('refuses a count that is not a number rather than answering with NaN grams', () => {
		// The pattern admits any run of digits, dots and slashes, so a malformed
		// count reaches the arithmetic as `NaN`. Every density-bound comparison
		// answers `false` to `NaN`, so without an outright check this came back as
		// `{ unit: 'cup', grams: NaN }` and logged a meal weighing nothing knowable.
		expect(parsePortionLabel('1.2.3 cup', 100)).toBeNull();
		expect(parsePortionLabel('1..5 tbsp', 30)).toBeNull();
	});

	it('refuses a weight no food could have in that volume', () => {
		// 100 g in a teaspoon is 20 g/ml, twenty times water. 310 catalog rows
		// say "1 tsp (100 g)"; reading one would log twenty times the food.
		expect(parsePortionLabel('1 tsp (100 g)', 100)).toBeNull();
		// A tenth of a gram in a cup is lighter than any food is.
		expect(parsePortionLabel('1 cup', 0.1)).toBeNull();
	});

	it('accepts the densest and the lightest food there is', () => {
		// Salt is 1.2 g/ml and honey 1.4; the ceiling is 3 g/ml, and a portion
		// exactly on it is data, not a defect.
		expect(parsePortionLabel('1 cup', 720)).toEqual({ unit: 'cup', grams: 720 });
		// The floor is 0.05 g/ml, below puffed cereal.
		expect(parsePortionLabel('1 cup', 12)).toEqual({ unit: 'cup', grams: 12 });
	});

	it('refuses a hair outside the densities food is found in', () => {
		expect(parsePortionLabel('1 cup', 720.1)).toBeNull();
		expect(parsePortionLabel('1 cup', 11.9)).toBeNull();
	});
});

describe('gramsPerVolumeUnit', () => {
	const OIL = { grams: 14, servingLabel: '1 tbsp' };

	it('prefers the food’s own portion row for the unit typed', () => {
		const food = {
			grams: 100,
			servingLabel: '100 g',
			portions: [
				{ unit: 'tbsp' as const, grams: 13.5 },
				{ unit: 'cup' as const, grams: 216 }
			]
		};
		expect(gramsPerVolumeUnit('tbsp', food)).toBe(13.5);
		expect(gramsPerVolumeUnit('cups', food)).toBe(216);
	});

	it('falls back to the food’s own serving label when no portion row names the unit', () => {
		expect(gramsPerVolumeUnit('tbsp', OIL)).toBe(14);
		expect(gramsPerVolumeUnit('tablespoons', OIL)).toBe(14);
	});

	it('falls back to the label when the portion rows name other units', () => {
		const food = {
			grams: 14,
			servingLabel: '1 tbsp',
			portions: [{ unit: 'cup' as const, grams: 216 }]
		};
		expect(gramsPerVolumeUnit('tbsp', food)).toBe(14);
	});

	it('answers nothing when neither the portions nor the label name the unit', () => {
		expect(gramsPerVolumeUnit('cup', OIL)).toBeNull();
		expect(gramsPerVolumeUnit('tsp', OIL)).toBeNull();
		expect(gramsPerVolumeUnit('cup', { grams: 40, servingLabel: '1/2 cup dry' })).toBeNull();
	});

	it('answers nothing for a unit that is not a volume, or for no food at all', () => {
		expect(gramsPerVolumeUnit('g', OIL)).toBeNull();
		expect(gramsPerVolumeUnit('cup', null)).toBeNull();
		expect(gramsPerVolumeUnit('cup', undefined)).toBeNull();
	});

	it('answers nothing for a food whose serving carries no label', () => {
		expect(gramsPerVolumeUnit('cup', { grams: 244 })).toBeNull();
	});

	it.each([
		['zero', 0],
		['negative', -13.5],
		['not a number', Number.NaN],
		['infinite', Number.POSITIVE_INFINITY]
	])('skips a portion row whose weight is %s and reads the label instead', (_name, grams) => {
		const food = {
			grams: 14,
			servingLabel: '1 tbsp',
			portions: [{ unit: 'tbsp' as const, grams }]
		};
		expect(gramsPerVolumeUnit('tbsp', food)).toBe(14);
	});
});

describe('withVolumeHint', () => {
	it.each([
		['1 tsp', '1 tsp (5 ml)'],
		['1 tbsp', '1 tbsp (15 ml)'],
		['2 Tbsp', '2 Tbsp (30 ml)'],
		['1 cup', '1 cup (240 ml)'],
		['1/2 cup', '1/2 cup (120 ml)'],
		['3/4 cup', '3/4 cup (180 ml)'],
		['0.25 tsp', '0.25 tsp (1.3 ml)']
	])('says how many millilitres "%s" is', (label, hinted) => {
		expect(withVolumeHint(label)).toBe(hinted);
	});

	it.each([
		// Already stated.
		'1 cup (240 ml)',
		'2 tbsp (30 g)',
		// A millilitre count needs no millilitre hint.
		'250 ml',
		'1 l',
		// Not a volume, or not one the label states outright.
		'100 g',
		'1 large',
		'1/2 cup dry',
		'1 PUDDING CUP',
		'',
		'0 cup'
	])('leaves "%s" as it is', (label) => {
		expect(withVolumeHint(label)).toBe(label);
	});
});
