import { defineConfig, devices } from '@playwright/test';
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
		reuseExistingServer: !isCI
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
	workers: isCI ? 1 : undefined,
	updateSnapshots: isCI ? 'none' : 'missing',
	projects,
	use: {
		baseURL,
		...proxy,
		trace: 'on-first-retry'
	}
});
