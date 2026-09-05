import { describe, expect, it } from 'vitest';
import { tokenize } from './text-tokens';

describe('tokenize', () => {
	it('splits a phrase into its words', () => {
		expect(tokenize('brown rice')).toEqual(['brown', 'rice']);
	});

	it('lowercases every word, so a shouted food reads as the same one', () => {
		expect(tokenize('Brown RICE')).toEqual(['brown', 'rice']);
	});

	it('keeps the characters a food name uses: digits, percent, dot, slash and hyphen', () => {
		expect(tokenize('milk 2% 1/2 cup low-fat 1.5')).toEqual([
			'milk',
			'2%',
			'1/2',
			'cup',
			'low-fat',
			'1.5'
		]);
	});

	it('turns punctuation it does not keep into a break rather than into a word', () => {
		expect(tokenize('chicken (grilled), plain')).toEqual(['chicken', 'grilled', 'plain']);
	});

	it('drops the empty pieces that leading, trailing and repeated spaces leave', () => {
		expect(tokenize('  brown   rice  ')).toEqual(['brown', 'rice']);
	});

	it('has no words for text that is nothing but punctuation', () => {
		expect(tokenize('!!!')).toEqual([]);
	});
});
