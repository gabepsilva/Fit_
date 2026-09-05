import { percentile } from './stats.ts';

/** Instrument 3's pure half: turning per-request timings into p50/p95 per endpoint. */

export interface EndpointLatency {
	endpoint: string;
	samples: number;
	p50Ms: number;
	p95Ms: number;
}

/** Pure: p50 and p95 over one endpoint's request timings. */
export function summarizeLatencies(
	endpoint: string,
	samplesMs: readonly number[]
): EndpointLatency {
	return {
		endpoint,
		samples: samplesMs.length,
		p50Ms: percentile(samplesMs, 0.5),
		p95Ms: percentile(samplesMs, 0.95)
	};
}

function round(value: number): string {
	return value.toFixed(1);
}

/** Pure: the report's lines, or the one line saying why there is nothing to report. */
export function formatServerLatency(
	rows: EndpointLatency[] | null,
	skipReason: string | null
): string[] {
	if (rows === null) return [`- Server latency: null (${skipReason ?? 'not measured'})`];
	const lines = ['| Endpoint | Samples | p50 (ms) | p95 (ms) |', '| --- | --- | --- | --- |'];
	for (const row of rows) {
		lines.push(`| ${row.endpoint} | ${row.samples} | ${round(row.p50Ms)} | ${round(row.p95Ms)} |`);
	}
	return lines;
}
