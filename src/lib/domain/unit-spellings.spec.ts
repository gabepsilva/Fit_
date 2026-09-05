import { describe, expect, it } from 'vitest';
import { classifyUnit } from './quantity';
import { volumeUnit } from './portions';
import {
	UNIT_SPELLINGS,
	UNIT_SPELLING_WORDS,
	canonicalUnit,
	isVolumeUnit,
	type CanonicalUnit
} from './unit-spellings';

describe('canonicalUnit', () => {
	it.each(Object.entries(UNIT_SPELLINGS))('reads "%s" as %s', (word, unit) => {
		expect(canonicalUnit(word)).toBe(unit);
	});

	it('is case- and space-insensitive', () => {
		expect(canonicalUnit('Tablespoons')).toBe('tbsp');
		expect(canonicalUnit('TBSP')).toBe('tbsp');
		expect(canonicalUnit(' cup ')).toBe('cup');
	});

	it.each(['', 'slice', 'slices', 'scoop', 'bottle', 'cupcake', 'cupcakes'])(
		'refuses "%s", which names no unit this app accepts',
		(word) => {
			expect(canonicalUnit(word)).toBeNull();
		}
	);

	it('does not mistake an inherited object property for a unit', () => {
		expect(canonicalUnit('constructor')).toBeNull();
		expect(canonicalUnit('toString')).toBeNull();
	});
});

describe('isVolumeUnit', () => {
	it.each(['tsp', 'tbsp', 'cup', 'ml', 'l'] as CanonicalUnit[])('says %s is a volume', (unit) => {
		expect(isVolumeUnit(unit)).toBe(true);
	});

	it.each(['g', 'kg', 'oz', 'lb'] as CanonicalUnit[])('says %s is not a volume', (unit) => {
		expect(isVolumeUnit(unit)).toBe(false);
	});
});

/**
 * The table both `portions.ts` (the label parser) and `quantity.ts` /
 * `parse-text.ts` (the typed-text parser) read. Issue #111: before this
 * module existed, a spelling accepted on one side was not guaranteed to be
 * accepted on the other — "tablespoons" was a volume to the label parser and
 * a bare count of servings to the typed one. Every spelling here is asserted
 * to round-trip identically through both.
 */
describe('every accepted spelling agrees on both sides of the parser', () => {
	it.each(UNIT_SPELLING_WORDS)('label and typed text agree on "%s"', (word) => {
		const canonical = canonicalUnit(word);
		expect(canonical).not.toBeNull();
		const isVolume = isVolumeUnit(canonical ?? 'g');

		// The label parser (portions.ts): a volume spelling resolves to its
		// canonical unit, a mass spelling resolves to no volume at all.
		expect(volumeUnit(word)).toBe(isVolume ? canonical : null);

		// The typed-text parser (quantity.ts): the same spelling classifies as
		// the same kind the label side agreed it was.
		expect(classifyUnit(word)).toBe(isVolume ? 'volume' : 'mass');
	});
});
