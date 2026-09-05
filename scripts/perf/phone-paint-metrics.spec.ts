import { describe, expect, it } from 'vitest';
import { formatPhonePaint, medianRouteMetrics } from './phone-paint-metrics';

describe('medianRouteMetrics', () => {
	it('takes the median of each measure independently across runs', () => {
		const metrics = medianRouteMetrics('/today', [
			{ domContentLoadedMs: 10, lcpMs: 100, transferredBytes: 1000 },
			{ domContentLoadedMs: 30, lcpMs: 300, transferredBytes: 3000 },
			{ domContentLoadedMs: 20, lcpMs: 200, transferredBytes: 2000 }
		]);
		expect(metrics).toEqual({
			route: '/today',
			domContentLoadedMs: 20,
			lcpMs: 200,
			transferredBytes: 2000
		});
	});
});

describe('formatPhonePaint', () => {
	it('renders one table row per route and rounds the medians', () => {
		const lines = formatPhonePaint({
			routes: [
				{ route: '/today', domContentLoadedMs: 123.6, lcpMs: 456.4, transferredBytes: 78_901 }
			],
			logSheetOpenMs: 42.2,
			catalogSearchMs: null,
			catalogSearchSkipReason: 'no catalog file installed'
		});
		expect(lines.some((line) => line.includes('| /today | 124 | 456 | 78901 |'))).toBe(true);
		expect(lines.some((line) => line === '- Log sheet open: 42 ms (median)')).toBe(true);
		expect(
			lines.some((line) => line === '- Catalog search round trip: null (no catalog file installed)')
		).toBe(true);
	});

	it('says a log sheet timing was not measured rather than printing null', () => {
		const lines = formatPhonePaint({
			routes: [],
			logSheetOpenMs: null,
			catalogSearchMs: null,
			catalogSearchSkipReason: null
		});
		expect(lines).toContain('- Log sheet open: not measured');
		expect(lines).toContain('- Catalog search round trip: null (not measured)');
	});
});
