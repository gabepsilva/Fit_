/**
 * The two numbers every instrument in this directory reduces its samples to:
 * the middle of the distribution and its slow tail. Shared so "p95" means the
 * same arithmetic everywhere a report prints it.
 */

/** Pure: the value at `fraction` through the sorted samples. Empty input is 0, not NaN. */
export function percentile(samples: readonly number[], fraction: number): number {
	if (samples.length === 0) return 0;
	const sorted = [...samples].sort((left, right) => left - right);
	const at = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
	return sorted[Math.max(0, at)] ?? 0;
}

/** Pure: the median, as `percentile(samples, 0.5)` under a shorter name. */
export function median(samples: readonly number[]): number {
	return percentile(samples, 0.5);
}
