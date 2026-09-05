import { median } from './stats.ts';

/**
 * Instrument 2's pure half: turning the raw per-navigation samples the
 * Playwright script collects into the medians the report prints. Kept apart
 * from the script itself (`phone-paint.run.ts`), which needs a browser and
 * cannot be unit tested the way this can.
 */

export interface RouteSample {
	domContentLoadedMs: number;
	lcpMs: number;
	transferredBytes: number;
}

export interface RouteMetrics {
	route: string;
	domContentLoadedMs: number;
	lcpMs: number;
	transferredBytes: number;
}

/** Pure: the median of each of the three measures, over one route's runs. */
export function medianRouteMetrics(route: string, samples: readonly RouteSample[]): RouteMetrics {
	return {
		route,
		domContentLoadedMs: median(samples.map((sample) => sample.domContentLoadedMs)),
		lcpMs: median(samples.map((sample) => sample.lcpMs)),
		transferredBytes: median(samples.map((sample) => sample.transferredBytes))
	};
}

export interface PhonePaintReport {
	routes: RouteMetrics[];
	logSheetOpenMs: number | null;
	catalogSearchMs: number | null;
	/** Why `catalogSearchMs` is null, when it is. */
	catalogSearchSkipReason: string | null;
}

function round(value: number): number {
	return Math.round(value);
}

/** Pure: `PhonePaintReport` as the report's markdown lines. */
export function formatPhonePaint(report: PhonePaintReport): string[] {
	const lines = [
		'| Route | DOMContentLoaded (ms) | LCP (ms) | Transferred (bytes) |',
		'| --- | --- | --- | --- |'
	];
	for (const route of report.routes) {
		lines.push(
			`| ${route.route} | ${round(route.domContentLoadedMs)} | ${round(route.lcpMs)} | ${round(route.transferredBytes)} |`
		);
	}
	lines.push('');
	lines.push(
		report.logSheetOpenMs === null
			? '- Log sheet open: not measured'
			: `- Log sheet open: ${round(report.logSheetOpenMs)} ms (median)`
	);
	lines.push(
		report.catalogSearchMs === null
			? `- Catalog search round trip: null (${report.catalogSearchSkipReason ?? 'not measured'})`
			: `- Catalog search round trip: ${round(report.catalogSearchMs)} ms (median)`
	);
	return lines;
}
