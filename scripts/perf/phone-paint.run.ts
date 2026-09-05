import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, type Response } from '@playwright/test';
import { catalogPath } from '../../src/lib/server/catalog/connection.ts';
import { openLogSheet, openSampleJournal, signInThroughApi } from '../../tests/e2e-support.ts';
import { test } from '../../tests/preview-server.ts';
import type { RouteSample } from './phone-paint-metrics.ts';

/**
 * Instrument 2: five page loads per route on the `mobile-chrome` profile,
 * recording `domContentLoaded`, largest contentful paint (falling back to
 * `loadEventEnd` where the browser reports no LCP), and transferred bytes.
 * Also the time to open the log sheet, and — where a catalog is installed —
 * one search round trip, warmed first (see `sampleCatalogSearch`) so the
 * sample is the client's cost rather than the server's cold catalog open.
 *
 * Run through `playwright test --config scripts/perf/phone-paint.config.ts`
 * rather than as a vitest spec: it needs a real browser and the preview
 * server `tests/preview-server.ts` starts for the e2e suite. It is not itself
 * an e2e test — it makes no assertion the way one would — so it does not
 * live under `**\/*.e2e.ts` and `test:e2e` never runs it.
 */
const ROUTES = ['/today', '/journal', '/progress', '/plan', '/you'];
const RUNS = 5;

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const OUTPUT_PATH = path.join(projectRoot, 'reports', 'perf', 'phone-paint.raw.json');

/** Largest contentful paint (or, failing that, `loadEventEnd`) plus `domContentLoadedEventEnd`. */
async function readNavigationTiming(
	page: Page
): Promise<{ domContentLoadedMs: number; lcpMs: number }> {
	return page.evaluate(() => {
		const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
		const lcp = (window as unknown as { __perfLcp: number | undefined }).__perfLcp;
		return {
			domContentLoadedMs: nav.domContentLoadedEventEnd,
			lcpMs: lcp ?? nav.loadEventEnd
		};
	});
}

/** Records the largest LCP candidate reported for the page currently loading, on every load. */
async function installLcpObserver(page: Page): Promise<void> {
	await page.addInitScript(() => {
		(window as unknown as { __perfLcp: number | undefined }).__perfLcp = undefined;
		try {
			const observer = new PerformanceObserver((list) => {
				const entries = list.getEntries();
				const last = entries.at(-1);
				if (last)
					(window as unknown as { __perfLcp: number | undefined }).__perfLcp = last.startTime;
			});
			observer.observe({ type: 'largest-contentful-paint', buffered: true });
		} catch {
			// Browser reports no LCP entry type; readNavigationTiming falls back to loadEventEnd.
		}
	});
}

/** One route, `RUNS` page loads, tracking transferred bytes per navigation. */
async function sampleRoute(page: Page, route: string): Promise<RouteSample[]> {
	const samples: RouteSample[] = [];
	for (let run = 0; run < RUNS; run += 1) {
		let bytes = 0;
		const onResponse = (response: Response) => {
			const length = response.headers()['content-length'];
			if (length !== undefined) bytes += Number(length);
		};
		page.on('response', onResponse);
		await page.goto(route, { waitUntil: 'load' });
		page.off('response', onResponse);
		const timing = await readNavigationTiming(page);
		samples.push({ ...timing, transferredBytes: bytes });
	}
	return samples;
}

/** Click "Log food" to the sheet's Close button taking focus, `RUNS` times. */
async function sampleLogSheetOpen(page: Page): Promise<number[]> {
	const samples: number[] = [];
	for (let run = 0; run < RUNS; run += 1) {
		await page.goto('/today', { waitUntil: 'load' });
		const started = Date.now();
		await openLogSheet(page);
		samples.push(Date.now() - started);
		await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
	}
	return samples;
}

/** One search round trip, if this machine has a catalog installed; `null` with why, otherwise. */
async function sampleCatalogSearch(
	page: Page
): Promise<{ ms: number | null; reason: string | null }> {
	if (!existsSync(catalogPath())) {
		return {
			ms: null,
			reason: `no catalog file at ${catalogPath()} — the catalog is not in the repository or in CI`
		};
	}
	await page.goto('/today', { waitUntil: 'load' });
	await openLogSheet(page);
	const box = page.getByLabel('Search foods, brands, barcodes');
	// A search this run has not asked yet is a cold one: `getCatalog()` opens
	// the 1.4 GB catalog file on the server's first request to reach it, and
	// that request's own query pages in btree and FTS leaves this fresh
	// process has never read, which measured multiple seconds on this
	// machine — nothing a browser or client change touches. A server that
	// has been running for any length of time in production has already
	// paid that cost once; timing a search this run has already asked once
	// before is what makes the sample below the client's own round trip
	// rather than a replay of the server's cold start.
	await box.fill('milk');
	await page.waitForResponse((candidate) => candidate.url().includes('/api/foods?'));
	await box.fill('');
	const started = Date.now();
	const response = page.waitForResponse((candidate) => candidate.url().includes('/api/foods?'));
	await box.fill('milk');
	await response;
	const ms = Date.now() - started;
	await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
	return { ms, reason: null };
}

test('phone profile paint', async ({ page, previewServer }) => {
	test.setTimeout(120_000);
	await installLcpObserver(page);
	await signInThroughApi(page, previewServer.baseURL);
	await page.goto('/');
	await openSampleJournal(page);

	const routeSamples: Record<string, RouteSample[]> = {};
	for (const route of ROUTES) routeSamples[route] = await sampleRoute(page, route);

	const logSheetSamples = await sampleLogSheetOpen(page);
	const catalogSearch = await sampleCatalogSearch(page);

	const raw = {
		routeSamples,
		logSheetSamples,
		catalogSearchMs: catalogSearch.ms,
		catalogSearchSkipReason: catalogSearch.reason
	};
	await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
	await writeFile(OUTPUT_PATH, `${JSON.stringify(raw, null, 2)}\n`);

	// Not an assertion about the product — this script is not a gate — but a
	// crashed run should say so rather than leaving a partial file behind.
	expect(Object.keys(routeSamples)).toHaveLength(ROUTES.length);
});
