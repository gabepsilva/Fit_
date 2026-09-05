import { beforeEach, describe, expect, it } from 'vitest';
import { foodProposal, NOT_FOUND_NOTE, PORTION_UNKNOWN_NOTE } from './food-proposal';
import { resetProposalIds } from './proposal-id';
import type { QuantitySpec } from './quantity';
import type { Food } from './types';
import { ZERO_MICROS } from './types';

/** A tablespoon of olive oil: 14 g, 119 kcal, so 2 tbsp is two servings. */
const OLIVE_OIL: Food = {
	id: 'olive-oil',
	name: 'Olive oil',
	aliases: [],
	category: 'fat',
	provenance: 'usda',
	servingLabel: '1 tbsp',
	grams: 14,
	kcal: 119,
	protein: 0,
	carbs: 0,
	fat: 13.5,
	micros: ZERO_MICROS
};

/** A row the catalog gave no serving weight for, so nothing can be divided by it. */
const WEIGHTLESS: Food = { ...OLIVE_OIL, id: 'weightless', name: 'Mystery', grams: 0 };

const grams = (amount: number): QuantitySpec => ({ amount, unit: 'g', kind: 'mass' });
const servings = (amount: number): QuantitySpec => ({ amount, unit: '', kind: 'serving' });

beforeEach(() => {
	resetProposalIds();
});

describe('foodProposal', () => {
	it('names the row after the catalog food, not after the words that found it', () => {
		const proposal = foodProposal({
			query: 'olive oil',
			food: OLIVE_OIL,
			quantity: servings(2),
			meal: 'dinner',
			confidence: 0.8
		});
		expect(proposal.name).toBe('Olive oil');
		expect(proposal.query).toBe('olive oil');
		expect(proposal.foodId).toBe('olive-oil');
		expect(proposal.meal).toBe('dinner');
		expect(proposal.confidence).toBe(0.8);
	});

	it('resolves the quantity against the food’s own serving weight', () => {
		const proposal = foodProposal({
			query: 'olive oil',
			food: OLIVE_OIL,
			quantity: grams(28),
			meal: 'dinner',
			confidence: 0.8
		});
		expect(proposal.servings).toBe(2);
		expect(proposal.quantity).toEqual(grams(28));
	});

	it('carries no note when the quantity was read against a real serving', () => {
		const proposal = foodProposal({
			query: 'olive oil',
			food: OLIVE_OIL,
			quantity: grams(28),
			meal: 'dinner',
			confidence: 0.8
		});
		expect(proposal.note).toBeUndefined();
	});

	it('says so rather than guessing when the serving weighs nothing', () => {
		const proposal = foodProposal({
			query: 'mystery',
			food: WEIGHTLESS,
			quantity: grams(74),
			meal: 'lunch',
			confidence: 0.6
		});
		expect(proposal.servings).toBe(1);
		expect(proposal.note).toBe(PORTION_UNKNOWN_NOTE);
	});

	it('keeps the words and the quantity of a food nothing was found for', () => {
		const proposal = foodProposal({
			query: 'xyzzy gruel',
			food: null,
			quantity: grams(200),
			meal: 'lunch',
			confidence: 0
		});
		expect(proposal.foodId).toBeNull();
		expect(proposal.name).toBe('xyzzy gruel');
		expect(proposal.servings).toBe(1);
		expect(proposal.quantity).toEqual(grams(200));
	});

	it('blames the catalog by default when there is no food', () => {
		const proposal = foodProposal({
			query: 'xyzzy gruel',
			food: null,
			quantity: servings(1),
			meal: 'lunch',
			confidence: 0
		});
		expect(proposal.note).toBe(NOT_FOUND_NOTE);
	});

	it('lets a caller that could not reach the catalog say that instead', () => {
		const proposal = foodProposal({
			query: 'eggs',
			food: null,
			quantity: servings(2),
			meal: 'breakfast',
			confidence: 0,
			note: 'Matching needs the server'
		});
		expect(proposal.note).toBe('Matching needs the server');
	});

	it('ignores that note when there is a food, so a match is never annotated as a miss', () => {
		const proposal = foodProposal({
			query: 'olive oil',
			food: OLIVE_OIL,
			quantity: servings(1),
			meal: 'dinner',
			confidence: 0.8,
			note: 'Matching needs the server'
		});
		expect(proposal.note).toBeUndefined();
	});

	it('gives every row an id of its own', () => {
		const one = foodProposal({
			query: 'a',
			food: null,
			quantity: servings(1),
			meal: 'lunch',
			confidence: 0
		});
		const two = foodProposal({
			query: 'a',
			food: OLIVE_OIL,
			quantity: servings(1),
			meal: 'lunch',
			confidence: 0
		});
		expect(one.id).toBe('proposal-0');
		expect(two.id).toBe('proposal-1');
	});
});
