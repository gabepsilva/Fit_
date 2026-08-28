import { describe, expect, it } from 'vitest';
import { FOOD_BY_ID } from './foods';
import { logFromFood } from './log-entry';

describe('logFromFood', () => {
	it('builds an entry from a catalog food', () => {
		const item = logFromFood({
			foodId: 'egg-large',
			servings: 2,
			meal: 'breakfast',
			date: '2026-06-01',
			source: 'manual'
		});
		expect(item.kcal).toBe((FOOD_BY_ID['egg-large']?.kcal ?? 0) * 2);
	});

	it('carries the catalog food’s provenance onto the entry', () => {
		const item = logFromFood({
			foodId: 'egg-large',
			servings: 1,
			meal: 'breakfast',
			date: '2026-06-01',
			source: 'manual'
		});
		expect(item.provenance).toBe(FOOD_BY_ID['egg-large']?.provenance);
	});

	it('keeps the note it was given', () => {
		const item = logFromFood({
			foodId: 'egg-large',
			servings: 1,
			meal: 'breakfast',
			date: '2026-06-01',
			source: 'manual',
			note: 'soft boiled'
		});
		expect(item.note).toBe('soft boiled');
	});

	it('refuses to invent an entry for an unknown food', () => {
		expect(() =>
			logFromFood({
				foodId: 'not-a-food',
				servings: 1,
				meal: 'lunch',
				date: '2026-06-01',
				source: 'manual'
			})
		).toThrow();
	});
});
