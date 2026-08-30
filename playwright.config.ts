import { defineConfig, devices } from '@playwright/test';
import { rmSync } from 'node:fs';
import { env } from 'node:process';

const isCI = Boolean(env.CI);
// The preview port is machine-global, so two checkouts running end-to-end flows at
// once would otherwise meet on 4173: `reuseExistingServer` means the second
// Playwright finds the first tree's server, tests the wrong application, and passes.
// `FIT_PREVIEW_PORT` gives a tree its own port, and `--strictPort` below makes a
// clash loud -- without it Vite quietly moves to the next free port and leaves
// `url` pointing at whatever the neighbor is serving.
const previewPort = env.FIT_PREVIEW_PORT ?? '4173';
if (!/^\d+$/.test(previewPort)) throw new Error('FIT_PREVIEW_PORT must be numeric.');
const baseURL = env.E2E_BASE_URL ?? `http://localhost:${previewPort}`;
const proxy = env.ZAP_PROXY_URL ? { proxy: { server: env.ZAP_PROXY_URL } } : {};
const previewHost = env.ZAP_PROXY_URL ? '0.0.0.0' : '127.0.0.1';
/**
 * End-to-end flows sign up and sign in through the real endpoints, so they need
 * a database — and it must not be the one someone is developing against.
 *
 * The suite registers eight accounts per run and `REGISTRATION_POLICY` allows
 * ten an hour from one address, so a second run inside the hour was answered
 * with 429 and nine tests failed on a throttle rather than on the application.
 * The accounts stayed behind too: twenty-five of them had accumulated in
 * `data/runtime/app.sqlite` before this was noticed.
 *
 * A file per port keeps two checkouts apart for the same reason the port
 * itself is per-checkout, and removing it before the server starts means every
 * run begins from an empty database rather than from whatever the last one
 * left. That is also why the server is never reused: a reused one holds this
 * file open, and the run that deleted it would be talking to an empty database
 * while the server wrote to the unlinked original.
 */
export const E2E_DATABASE_PATH = env.E2E_DB_PATH ?? `data/runtime/e2e-${previewPort}.sqlite`;

// This file is loaded by the runner *and* by every worker, so an unguarded
// delete would unlink the database out from under a run in progress. Playwright
// sets `TEST_WORKER_INDEX` only in workers, and only the runner reaches here
// before the server starts.
if (env.TEST_WORKER_INDEX === undefined) {
	for (const suffix of ['', '-wal', '-shm'])
		rmSync(`${E2E_DATABASE_PATH}${suffix}`, { force: true });
}
// Fit_ is a mobile web app, so the default loop runs a mobile viewport on the
// engine that is always installed. Desktop is a responsive-regression backstop
// and runs with the full matrix, not on every local run.
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
