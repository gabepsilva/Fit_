import { describe, expect, it } from 'vitest';
import { barcodeOf, searchTerms, singular } from './query';

describe('searchTerms', () => {
	it('prefix-matches every token, so "banana" reaches "Bananas, raw"', () => {
		expect(searchTerms('greek yogurt')).toEqual({
			match: '"greek"* "yogurt"*',
			text: 'greek yogurt'
		});
	});

	it('keeps FTS5 syntax out of the match expression', () => {
		// A quote would close the phrase, `NEAR` and `*` are operators, and `-`
		// negates. None of them survive tokenizing, so none reach FTS5.
		expect(searchTerms('milk" NEAR/2 -chocolate*')).toEqual({
			match: '"milk"* "near"* "chocolate"*',
			text: 'milk near chocolate'
		});
	});

	it('keeps LIKE wildcards out of the text the ranking compares against', () => {
		expect(searchTerms('%milk_')?.text).toBe('milk');
	});

	it('drops tokens shorter than three characters', () => {
		expect(searchTerms('v8 juice')?.text).toBe('juice');
	});

	it('has nothing to search when every token is too short', () => {
		expect(searchTerms('a b')).toBeNull();
		expect(searchTerms('   ')).toBeNull();
	});

	it('caps the number of tokens', () => {
		const typed = 'one two three four five six seven eight nine ten eleven';
		expect(searchTerms(typed)?.text.split(' ')).toHaveLength(8);
	});

	it('caps the length of a token', () => {
		expect(searchTerms('m'.repeat(50))?.text).toHaveLength(32);
	});

	it('keeps digits and accented letters, which the catalog tokenizer folds', () => {
		expect(searchTerms('Café 100% Cacao')?.text).toBe('café 100 cacao');
	});
});

describe('singular', () => {
	it('drops one trailing s from a word longer than three characters', () => {
		expect(singular('bananas')).toBe('banana');
	});

	it('leaves short words alone, so "oats" is not mangled to "oat"', () => {
		expect(singular('gas')).toBe('gas');
		expect(singular('oats')).toBe('oat');
	});

	it('leaves a word that does not end in s', () => {
		expect(singular('milk')).toBe('milk');
	});
});

describe('barcodeOf', () => {
	it('pads a UPC-A to the GTIN-14 the catalog stores', () => {
		expect(barcodeOf('012345678905')).toBe('00012345678905');
	});

	it('pads an EAN-8', () => {
		expect(barcodeOf('96385074')).toBe('00000096385074');
	});

	it('keeps a GTIN-14 as it is', () => {
		expect(barcodeOf('00000000005487')).toBe('00000000005487');
	});

	it('ignores separators a scanner or a person may include', () => {
		expect(barcodeOf(' 0 12345-678905 ')).toBe('00012345678905');
	});

	it('refuses digits that are too few or too many to be a barcode', () => {
		expect(barcodeOf('1234567')).toBeNull();
		expect(barcodeOf('123456789012345')).toBeNull();
	});

	it('refuses text that carries no digits', () => {
		expect(barcodeOf('milk')).toBeNull();
	});
});
