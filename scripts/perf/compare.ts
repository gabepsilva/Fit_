import type { PerfReport } from './report.ts';

/** `--compare`: current against a stored baseline, metric by metric. */

export interface MetricRow {
	label: string;
	before: number | null;
	after: number | null;
	delta: number | null;
}

function row(label: string, before: number | null, after: number | null): MetricRow {
	return { label, before, after, delta: before === null || after === null ? null : after - before };
}

/** Pure: every metric both reports carry, paired by route or endpoint name. */
export function compareReports(baseline: PerfReport, current: PerfReport): MetricRow[] {
	const rows: MetricRow[] = [
		row('bundle JS bytes', baseline.bundle.javascriptBytes, current.bundle.javascriptBytes),
		row('bundle CSS bytes', baseline.bundle.cssBytes, current.bundle.cssBytes),
		row(
			'bundle largest asset bytes',
			baseline.bundle.largestAsset.bytes,
			current.bundle.largestAsset.bytes
		)
	];

	for (const route of current.phonePaint.routes) {
		const before = baseline.phonePaint.routes.find((entry) => entry.route === route.route) ?? null;
		rows.push(
			row(`${route.route} DCL ms`, before?.domContentLoadedMs ?? null, route.domContentLoadedMs)
		);
		rows.push(row(`${route.route} LCP ms`, before?.lcpMs ?? null, route.lcpMs));
		rows.push(
			row(`${route.route} bytes`, before?.transferredBytes ?? null, route.transferredBytes)
		);
	}
	rows.push(
		row('log sheet open ms', baseline.phonePaint.logSheetOpenMs, current.phonePaint.logSheetOpenMs)
	);
	rows.push(
		row(
			'catalog search round trip ms',
			baseline.phonePaint.catalogSearchMs,
			current.phonePaint.catalogSearchMs
		)
	);

	for (const endpoint of current.serverLatency.rows ?? []) {
		const before = baseline.serverLatency.rows?.find(
			(entry) => entry.endpoint === endpoint.endpoint
		);
		rows.push(row(`${endpoint.endpoint} p50 ms`, before?.p50Ms ?? null, endpoint.p50Ms));
		rows.push(row(`${endpoint.endpoint} p95 ms`, before?.p95Ms ?? null, endpoint.p95Ms));
	}

	return rows;
}

function cell(value: number | null): string {
	return value === null ? 'null' : value.toFixed(1);
}

function delta(value: number | null): string {
	if (value === null) return '';
	return value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

/** Pure: `compareReports` output as an aligned table. */
export function formatCompare(rows: MetricRow[]): string {
	const lines = ['| Metric | Baseline | Current | Δ |', '| --- | --- | --- | --- |'];
	for (const entry of rows) {
		lines.push(
			`| ${entry.label} | ${cell(entry.before)} | ${cell(entry.after)} | ${delta(entry.delta)} |`
		);
	}
	return lines.join('\n');
}
