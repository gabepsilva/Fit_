import { describe, expect, it } from 'vitest';
import { bundleMetrics, formatBundleMetrics } from './bundle';
import { measure } from '../quality/bundle-assets';

describe('bundleMetrics', () => {
	it('carries JS, CSS and the largest asset out of a full measurement', () => {
		const measurement = measure([
			{ file: 'a.js', bytes: 100 },
			{ file: 'a.css', bytes: 10 },
			{ file: 'b.js', bytes: 900 }
		]);
		expect(bundleMetrics(measurement)).toEqual({
			javascriptBytes: 1000,
			cssBytes: 10,
			largestAsset: { file: 'b.js', bytes: 900 }
		});
	});
});

describe('formatBundleMetrics', () => {
	it('renders one line per metric with the file name for the largest asset', () => {
		const lines = formatBundleMetrics({
			javascriptBytes: 1000,
			cssBytes: 10,
			largestAsset: { file: 'b.js', bytes: 900 }
		});
		expect(lines).toEqual([
			'- JS: 1000 bytes',
			'- CSS: 10 bytes',
			'- Largest asset: b.js (900 bytes)'
		]);
	});

	it('names an empty build rather than printing a blank file', () => {
		const lines = formatBundleMetrics({
			javascriptBytes: 0,
			cssBytes: 0,
			largestAsset: { file: '', bytes: 0 }
		});
		expect(lines[2]).toBe('- Largest asset: (none) (0 bytes)');
	});
});
