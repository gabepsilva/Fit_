import { describe, expect, it } from 'vitest';
import {
	classifyUnit,
	describeRecorded,
	matchToFood,
	resolveQuantity,
	type QuantitySpec
} from './quantity';
import type { Food, ProposedItem } from './types';
import { ZERO_MICROS } from './types';

const spec = (amount: number, unit: string): QuantitySpec => ({
	amount,
	unit,
	kind: classifyUnit(unit)
});

/** Only `grams` is read; a bare shape keeps the cases about the arithmetic. */
const serving = (grams: number) => ({ grams });

const CHICKEN: Food = {
	id: 'chicken-breast',
	name: 'Chicken breast, grilled',
	aliases: [],
	category: 'protein',
	provenance: 'usda',
	servingLabel: '100 g',
	grams: 100,
	kcal: 165,
	protein: 31,
	carbs: 0,
	fat: 3.6,
	micros: ZERO_MICROS
};

const PROPOSAL: ProposedItem = {
	foodId: null,
	query: 'gruel',
	name: 'gruel',
	servings: 1,
	meal: 'lunch',
	confidence: 0
};

describe('classifyUnit', () => {
	it.each(['g', 'gram', 'grams', 'kg', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pounds'])(
		'reads "%s" as a mass',
		(unit) => {
			expect(classifyUnit(unit)).toBe('mass');
		}
	);

	it.each(['cup', 'cups', 'tbsp', 'tsp', 'ml', 'l'])('reads "%s" as a volume', (unit) => {
		expect(classifyUnit(unit)).toBe('volume');
	});

	it.each(['', 'slice', 'slices', 'scoop', 'can', 'bowl', 'eggs'])(
		'reads "%s" as a count of servings',
		(unit) => {
			expect(classifyUnit(unit)).toBe('serving');
		}
	);

	it('ignores the case the unit was typed in', () => {
		expect(classifyUnit('G')).toBe('mass');
		expect(classifyUnit('Cups')).toBe('volume');
	});

	it('does not mistake an inherited object property for a unit', () => {
		expect(classifyUnit('constructor')).toBe('serving');
		expect(classifyUnit('toString')).toBe('serving');
	});
});

describe('resolveQuantity', () => {
	it('divides a mass in grams by the food’s own serving weight', () => {
		expect(resolveQuantity(spec(200, 'g'), serving(100))).toEqual({
			servings: 2,
			declined: null
		});
	});

	it('resolves against a serving that is not 100 g', () => {
		// 200 g of a 244 g serving is a little over four fifths of one.
		expect(resolveQuantity(spec(200, 'g'), serving(244))).toEqual({
			servings: 0.82,
			declined: null
		});
	});

	it('converts ounces to grams before dividing', () => {
		// 8 oz is 226.796 g, so a touch over two 100 g servings.
		expect(resolveQuantity(spec(8, 'oz'), serving(100))).toEqual({
			servings: 2.27,
			declined: null
		});
	});

	it.each([
		['kg', 1, 1000],
		['lb', 1, 453.59237],
		['grams', 250, 250]
	])('converts %s to grams', (unit, amount, grams) => {
		expect(resolveQuantity(spec(amount, unit), serving(grams)).servings).toBe(1);
	});

	it('keeps a bare number as a count of servings', () => {
		expect(resolveQuantity(spec(2, ''), serving(50))).toEqual({ servings: 2, declined: null });
	});

	it('keeps a per-item unit as a count of servings', () => {
		expect(resolveQuantity(spec(2, 'slices'), serving(40))).toEqual({
			servings: 2,
			declined: null
		});
	});

	it('refuses to turn a volume into servings when the food names none of it', () => {
		const cups = spec(2, 'cups');
		expect(resolveQuantity(cups, serving(244))).toEqual({ servings: 1, declined: cups });
	});

	it('reads a volume off the food’s own portion row for that unit', () => {
		// 13.5 g in a tablespoon of oil against a 14 g serving: 27 g is 1.93 of one.
		const oil = {
			grams: 14,
			servingLabel: '1 tbsp',
			portions: [{ unit: 'tbsp' as const, grams: 13.5 }]
		};
		expect(resolveQuantity(spec(2, 'tbsp'), oil)).toEqual({ servings: 1.93, declined: null });
	});

	it('reads a volume off the food’s own serving label when no portion row names the unit', () => {
		// Issue #94: a serving is one cup, so two cups is two servings.
		const milk = { grams: 244, servingLabel: '1 cup' };
		expect(resolveQuantity(spec(2, 'cups'), milk)).toEqual({ servings: 2, declined: null });
		expect(resolveQuantity(spec(0.5, 'cup'), milk)).toEqual({ servings: 0.5, declined: null });
	});

	it('scales a volume against a serving the label counts differently', () => {
		// A serving is two tablespoons of peanut butter, so one is half of it.
		const peanutButter = { grams: 32, servingLabel: '2 tbsp' };
		expect(resolveQuantity(spec(1, 'tbsp'), peanutButter)).toEqual({
			servings: 0.5,
			declined: null
		});
	});

	it.each([
		// A label that does not state a volume outright is not read for one.
		['1/2 cup dry', 40, 'cups'],
		['170 g cup', 170, 'cups'],
		['1 oz (23 nuts)', 28, 'cups'],
		['1 bottle (414 ml)', 414, 'ml'],
		// The unit typed is not the unit the label names.
		['1 cup', 244, 'tbsp'],
		['1 tbsp', 21, 'tsp']
	])('declines %s against a food whose serving is "%s"', (servingLabel, grams, unit) => {
		const quantity = spec(2, unit);
		expect(resolveQuantity(quantity, { grams, servingLabel })).toEqual({
			servings: 1,
			declined: quantity
		});
	});

	it.each([
		['zero', 0],
		['negative', -100],
		['not a number', Number.NaN],
		['infinite', Number.POSITIVE_INFINITY]
	])('declines a mass when the serving weight is %s', (_label, grams) => {
		const mass = spec(200, 'g');
		expect(resolveQuantity(mass, serving(grams))).toEqual({ servings: 1, declined: mass });
	});

	it('declines a mass when there is no food to resolve it against', () => {
		const mass = spec(200, 'g');
		expect(resolveQuantity(mass, null)).toEqual({ servings: 1, declined: mass });
		expect(resolveQuantity(mass, undefined)).toEqual({ servings: 1, declined: mass });
	});

	it('declines a quantity that is not a finite number', () => {
		const broken = spec(Number.NaN, 'g');
		expect(resolveQuantity(broken, serving(100))).toEqual({ servings: 1, declined: broken });
	});

	it('rounds to the two decimals the stepper works in', () => {
		expect(resolveQuantity(spec(150, 'g'), serving(195)).servings).toBe(0.77);
	});

	it('keeps a quantity too small for two decimals rather than recording nothing', () => {
		const { servings } = resolveQuantity(spec(0.5, 'g'), serving(195));
		expect(servings).toBeGreaterThan(0);
		expect(servings).toBeCloseTo(0.002564, 6);
	});
});

describe('describeRecorded', () => {
	it('states the servings and the mass they come to', () => {
		expect(describeRecorded(2, serving(100), null)).toBe('2 servings · 200 g');
	});

	it('says "serving" in the singular', () => {
		expect(describeRecorded(1, serving(244), null)).toBe('1 serving · 244 g');
	});

	it('states a fractional count without trailing noise', () => {
		expect(describeRecorded(0.82, serving(244), null)).toBe('0.82 servings · 200 g');
		expect(describeRecorded(0.5, serving(40), null)).toBe('0.5 servings · 20 g');
	});

	it('leaves the mass out when the food has no serving weight', () => {
		expect(describeRecorded(2, serving(0), null)).toBe('2 servings');
		expect(describeRecorded(2, null, null)).toBe('2 servings');
		expect(describeRecorded(2, serving(Number.POSITIVE_INFINITY), null)).toBe('2 servings');
	});

	it('rounds a long count rather than printing every digit of it', () => {
		// 8 oz against a 100 g serving, unrounded.
		expect(describeRecorded(2.26796185, serving(100), null)).toBe('2.268 servings · 227 g');
	});

	it('says plainly which quantity it could not use, and what it recorded instead', () => {
		expect(describeRecorded(1, serving(244), spec(2, 'cups'))).toBe(
			'Couldn’t use “2 cups” — recorded as 1 serving · 244 g'
		);
	});

	it('reports a declined mass the same way', () => {
		expect(describeRecorded(1, null, spec(200, 'g'))).toBe(
			'Couldn’t use “200 g” — recorded as 1 serving'
		);
	});

	it('promises nothing about the unit it declined', () => {
		const said = describeRecorded(1, serving(244), spec(2, 'cups'));
		expect(said).not.toMatch(/soon|later|support|yet/i);
	});
});

describe('matchToFood', () => {
	it('re-reads the typed mass against the food the person picked', () => {
		const item = { ...PROPOSAL, quantity: spec(200, 'g') };
		expect(matchToFood(item, CHICKEN)).toEqual({
			...item,
			foodId: 'chicken-breast',
			name: 'Chicken breast, grilled',
			confidence: 1,
			servings: 2
		});
	});

	it('leaves the servings alone when the item carries no parsed quantity', () => {
		expect(matchToFood({ ...PROPOSAL, servings: 3 }, CHICKEN).servings).toBe(3);
	});

	it('still declines a volume against the newly matched food', () => {
		const cups = spec(2, 'cups');
		const matched = matchToFood({ ...PROPOSAL, quantity: cups }, CHICKEN);
		expect(matched.servings).toBe(1);
		expect(resolveQuantity(cups, CHICKEN).declined).toEqual(cups);
	});
});
