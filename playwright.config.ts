import { defineConfig, devices } from '@playwright/test';
import { rmSync } from 'node:fs';
import { env } from 'node:process';

const isCI = Boolean(env.CI);
// Per-checkout port: `reuseExistingServer` + a shared port would silently test the wrong app.
const previewPort = env.FIT_PREVIEW_PORT ?? '4173';
if (!/^\d+$/.test(previewPort)) throw new Error('FIT_PREVIEW_PORT must be numeric.');
const baseURL = env.E2E_BASE_URL ?? `http://localhost:${previewPort}`;
const proxy = env.ZAP_PROXY_URL ? { proxy: { server: env.ZAP_PROXY_URL } } : {};
const previewHost = env.ZAP_PROXY_URL ? '0.0.0.0' : '127.0.0.1';
// Per-port DB file so concurrent checkouts don't collide; deleted before server start for a clean run.
export const E2E_DATABASE_PATH = env.E2E_DB_PATH ?? `data/runtime/e2e-${previewPort}.sqlite`;

// Only the runner (not workers) should delete: Playwright sets TEST_WORKER_INDEX in workers.
if (env.TEST_WORKER_INDEX === undefined) {
	for (const suffix of ['', '-wal', '-shm'])
		rmSync(`${E2E_DATABASE_PATH}${suffix}`, { force: true });
}
// Default: mobile only. Full matrix (safari, desktop) via E2E_ALL_BROWSERS.
const projects = [
	{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
	...(env.E2E_ALL_BROWSERS
		? [
				{ name: 'mobile-safari', use: { ...devices['iPhone 15'] } },
				{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
				{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }
			]
		: [])
];

export default defineConfig({
	webServer: {
		command: `bun run build && bun run preview --host ${previewHost} --port ${previewPort} --strictPort`,
		url: `http://127.0.0.1:${previewPort}`,
		env: { FIT_DB_PATH: E2E_DATABASE_PATH },
		reuseExistingServer: false
	},
	testMatch: '**/*.e2e.{ts,js}',
	// A human reporter, a machine-readable one, and the HTML report for humans.
	reporter: [
		['list'],
		['json', { outputFile: 'reports/quality/playwright.json' }],
		['html', { open: 'never' }]
	],
	forbidOnly: true,
	failOnFlakyTests: true,
	retries: isCI ? 1 : 0,
	// Spread rather than `isCI ? 1 : undefined`: under `exactOptionalPropertyTypes`
	// an explicit `undefined` is not the same as an absent key, and Playwright's
	// own type says so. Absent is what "let Playwright choose" means.
	...(isCI ? { workers: 1 } : {}),
	updateSnapshots: isCI ? 'none' : 'missing',
	projects,
	use: {
		baseURL,
		...proxy,
		trace: 'on-first-retry'
	}
});
