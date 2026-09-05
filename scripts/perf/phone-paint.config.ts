import { defineConfig, devices } from '@playwright/test';

/**
 * A dedicated Playwright config for instrument 2, not wired into
 * `playwright.config.ts`'s matrix: this is a measurement, not a pass/fail
 * suite, and its one spec (`phone-paint.run.ts`) does not match
 * `**\/*.e2e.{ts,js}`, so `test:e2e` never picks it up by accident.
 *
 * The phone the app is built for, same as `DEFAULT_E2E_PROJECT` in
 * `scripts/quality/e2e-projects.ts` — deliberately not imported from there,
 * so a change to the default e2e project does not silently change what this
 * instrument measures without a person deciding that on purpose.
 */
export default defineConfig({
	globalSetup: '../../tests/e2e-build.ts',
	testMatch: '**/phone-paint.run.ts',
	testDir: '.',
	reporter: [['list']],
	forbidOnly: true,
	retries: 0,
	workers: 1,
	timeout: 120_000,
	projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }]
});
