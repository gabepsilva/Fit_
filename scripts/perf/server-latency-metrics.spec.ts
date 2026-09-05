import { describe, expect, it } from 'vitest';
import { formatServerLatency, summarizeLatencies } from './server-latency-metrics';

describe('summarizeLatencies', () => {
	it('reports the sample count alongside p50 and p95', () => {
		const summary = summarizeLatencies('GET /api/foods', [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
		expect(summary).toEqual({ endpoint: 'GET /api/foods', samples: 10, p50Ms: 50, p95Ms: 100 });
	});
});

describe('formatServerLatency', () => {
	it('renders one table row per endpoint', () => {
		const lines = formatServerLatency(
			[{ endpoint: 'GET /api/foods', samples: 88, p50Ms: 1.234, p95Ms: 5.678 }],
			null
		);
		expect(lines).toContain('| GET /api/foods | 88 | 1.2 | 5.7 |');
	});

	it('says why there is nothing to report when rows is null', () => {
		const lines = formatServerLatency(null, 'no catalog file installed');
		expect(lines).toEqual(['- Server latency: null (no catalog file installed)']);
	});

	it('falls back to a generic reason when none is given', () => {
		expect(formatServerLatency(null, null)).toEqual(['- Server latency: null (not measured)']);
	});
});
