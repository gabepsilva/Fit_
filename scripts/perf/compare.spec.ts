import { describe, expect, it } from 'vitest';
import { compareReports, formatCompare } from './compare';
import type { PerfReport } from './report';

function report(overrides: Partial<PerfReport> = {}): PerfReport {
	return {
		when: '2026-09-05T00:00:00.000Z',
		bundle: { javascriptBytes: 1000, cssBytes: 100, largestAsset: { file: 'a.js', bytes: 500 } },
		phonePaint: {
			routes: [{ route: '/today', domContentLoadedMs: 50, lcpMs: 60, transferredBytes: 900 }],
			logSheetOpenMs: 200,
			catalogSearchMs: null,
			catalogSearchSkipReason: 'no catalog file installed'
		},
		serverLatency: { rows: null, skipReason: 'no catalog file installed' },
		sqlPlans: { catalogSource: 'fixture', statementCount: 21, unresolvedCount: 2 },
		...overrides
	};
}

describe('compareReports', () => {
	it('computes a positive delta for a regression and a negative one for an improvement', () => {
		const baseline = report();
		const current = report({
			bundle: { javascriptBytes: 1100, cssBytes: 90, largestAsset: { file: 'a.js', bytes: 500 } }
		});
		const rows = compareReports(baseline, current);
		expect(rows).toContainEqual({
			label: 'bundle JS bytes',
			before: 1000,
			after: 1100,
			delta: 100
		});
		expect(rows).toContainEqual({ label: 'bundle CSS bytes', before: 100, after: 90, delta: -10 });
	});

	it('leaves the delta null when a route is new and has no baseline match', () => {
		const baseline = report({ phonePaint: { ...report().phonePaint, routes: [] } });
		const rows = compareReports(baseline, report());
		expect(rows).toContainEqual({ label: '/today DCL ms', before: null, after: 50, delta: null });
	});

	it('pairs server latency rows by endpoint name when both reports measured them', () => {
		const withLatency: PerfReport = {
			...report(),
			serverLatency: {
				rows: [{ endpoint: 'GET /api/foods', samples: 88, p50Ms: 2, p95Ms: 8 }],
				skipReason: null
			}
		};
		const rows = compareReports(withLatency, {
			...withLatency,
			serverLatency: {
				rows: [{ endpoint: 'GET /api/foods', samples: 88, p50Ms: 3, p95Ms: 8 }],
				skipReason: null
			}
		});
		expect(rows).toContainEqual({ label: 'GET /api/foods p50 ms', before: 2, after: 3, delta: 1 });
	});
});

describe('formatCompare', () => {
	it('signs a positive delta and prints null for an unmeasured metric', () => {
		const text = formatCompare([
			{ label: 'bundle JS bytes', before: 1000, after: 1100, delta: 100 },
			{ label: 'catalog search round trip ms', before: null, after: null, delta: null }
		]);
		expect(text).toContain('| bundle JS bytes | 1000.0 | 1100.0 | +100.0 |');
		expect(text).toContain('| catalog search round trip ms | null | null |  |');
	});
});
