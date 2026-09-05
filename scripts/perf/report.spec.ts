import { describe, expect, it } from 'vitest';
import { catalogHint, formatReport } from './report';
import type { PerfReport } from './report';

const base: PerfReport = {
	when: '2026-09-05T00:00:00.000Z',
	bundle: { javascriptBytes: 1000, cssBytes: 100, largestAsset: { file: 'a.js', bytes: 500 } },
	phonePaint: {
		routes: [{ route: '/today', domContentLoadedMs: 50, lcpMs: 60, transferredBytes: 900 }],
		logSheetOpenMs: 200,
		catalogSearchMs: null,
		catalogSearchSkipReason: 'no catalog file installed'
	},
	serverLatency: { rows: null, skipReason: 'no catalog file installed' },
	sqlPlans: { catalogSource: 'fixture', statementCount: 21, unresolvedCount: 2 }
};

describe('formatReport', () => {
	it('numbers the four instruments as their own sections', () => {
		const text = formatReport(base);
		expect(text).toContain('## 1. Bundle');
		expect(text).toContain('## 2. Phone-profile paint');
		expect(text).toContain('## 3. Server latency');
		expect(text).toContain('## 4. SQLite plans');
	});

	it('says how many statements were plotted and against which schema', () => {
		expect(formatReport(base)).toContain(
			'21 statements plotted against the in-memory fixture schema'
		);
	});

	it('names the unresolved count when any call site could not be checked', () => {
		expect(formatReport(base)).toContain('2 call site(s) the parser could not resolve');
	});

	it('says every statement resolved when none are left unresolved', () => {
		const text = formatReport({
			...base,
			sqlPlans: { catalogSource: 'live', statementCount: 5, unresolvedCount: 0 }
		});
		expect(text).toContain('Every statement the parser looked for was resolved.');
		expect(text).toContain('5 statements plotted against the live catalog');
	});
});

describe('catalogHint', () => {
	it('names FIT_CATALOG_PATH when this run had no catalog', () => {
		const hint = catalogHint(base);
		expect(hint).toContain('FIT_CATALOG_PATH');
	});

	it('is null once instrument 4 ran against the live catalog', () => {
		expect(
			catalogHint({ ...base, sqlPlans: { ...base.sqlPlans, catalogSource: 'live' } })
		).toBeNull();
	});
});
