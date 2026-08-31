import { describe, expect, it } from 'vitest';
import { pooled } from './pool';

describe('bounded work pool', () => {
	it('returns results in input order however the work completes', async () => {
		const delays = [40, 0, 20, 0, 10];
		const results = await pooled(delays, 2, async (delay) => {
			await new Promise((resolve) => setTimeout(resolve, delay));
			return delay;
		});
		expect(results).toEqual(delays);
	});

	it('never runs more than the limit at once', async () => {
		let running = 0;
		let peak = 0;
		await pooled(
			Array.from({ length: 12 }, (_, index) => index),
			3,
			async () => {
				running += 1;
				peak = Math.max(peak, running);
				await new Promise((resolve) => setTimeout(resolve, 5));
				running -= 1;
			}
		);
		expect(peak).toBe(3);
	});

	it('runs everything when the limit exceeds the work', async () => {
		const seen: number[] = [];
		await pooled([1, 2, 3], 10, (item) => Promise.resolve(seen.push(item)));
		expect(seen.toSorted()).toEqual([1, 2, 3]);
	});
});
