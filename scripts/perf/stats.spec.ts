import { describe, expect, it } from 'vitest';
import { median, percentile } from './stats';

describe('percentile', () => {
	it('is 0 for no samples', () => {
		expect(percentile([], 0.5)).toBe(0);
	});

	it('picks the exact value at the requested fraction of a sorted run', () => {
		const samples = [10, 30, 20, 40, 50];
		expect(percentile(samples, 0.5)).toBe(30);
		expect(percentile(samples, 1)).toBe(50);
	});

	it('does not mutate its input', () => {
		const samples = [30, 10, 20];
		percentile(samples, 0.5);
		expect(samples).toEqual([30, 10, 20]);
	});
});

describe('median', () => {
	it('is percentile at 0.5', () => {
		expect(median([1, 2, 3, 4])).toBe(percentile([1, 2, 3, 4], 0.5));
	});
});
