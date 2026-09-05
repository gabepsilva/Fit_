import type { BundleMetrics } from './bundle.ts';
import type { PhonePaintReport } from './phone-paint-metrics.ts';
import { formatBundleMetrics } from './bundle.ts';
import { formatPhonePaint } from './phone-paint-metrics.ts';
import { formatServerLatency } from './server-latency-metrics.ts';
import type { EndpointLatency } from './server-latency-metrics.ts';

/**
 * The shape `perf:measure` writes to `reports/perf/latest.json` (and, with
 * `--baseline`, to `quality/perf-baseline.json`): every instrument's numbers,
 * one JSON-serializable record. The full SQL plans are their own file
 * (`plans.md`/`quality/perf-plans.md`); this only carries how many statements
 * instrument 4 found, so `--compare` has something to say about it without
 * repeating the plan text.
 */
export interface PerfReport {
	when: string;
	bundle: BundleMetrics;
	phonePaint: PhonePaintReport;
	serverLatency: { rows: EndpointLatency[] | null; skipReason: string | null };
	sqlPlans: { catalogSource: 'live' | 'fixture'; statementCount: number; unresolvedCount: number };
}

/** Pure: the whole human report, `latest.md`. */
export function formatReport(report: PerfReport): string {
	return [
		'# Perf measurements',
		'',
		`Recorded ${report.when}.`,
		'',
		'## 1. Bundle',
		'',
		...formatBundleMetrics(report.bundle),
		'',
		'## 2. Phone-profile paint (mobile-chrome, 5 runs, median)',
		'',
		...formatPhonePaint(report.phonePaint),
		'',
		'## 3. Server latency',
		'',
		...formatServerLatency(report.serverLatency.rows, report.serverLatency.skipReason),
		'',
		'## 4. SQLite plans',
		'',
		`${report.sqlPlans.statementCount} statements plotted against the ${
			report.sqlPlans.catalogSource === 'live' ? 'live catalog' : 'in-memory fixture schema'
		}; see \`reports/perf/plans.md\`.`,
		report.sqlPlans.unresolvedCount > 0
			? `${report.sqlPlans.unresolvedCount} call site(s) the parser could not resolve — see the "Not extracted" section of that file.`
			: 'Every statement the parser looked for was resolved.',
		''
	].join('\n');
}
