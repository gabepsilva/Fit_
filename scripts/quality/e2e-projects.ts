/**
 * The end-to-end browser matrix, and the browser each project needs installed.
 *
 * One hosted job per project. `bunx playwright install` is the second most
 * expensive step in that job, and a per-project job downloads exactly the one
 * engine it runs instead of all three. The matrix is data rather than a
 * workflow literal so `check:ci-contract` can prove CI runs every project and
 * none is silently dropped.
 *
 * Devices are named rather than imported from Playwright so the contract check
 * can read this file without loading the test runner.
 */
export interface E2eProject {
	/** The Playwright browser this project needs installed. */
	browser: 'chromium' | 'firefox' | 'webkit';
	/** The `devices` entry the project emulates. */
	device: string;
}

export const e2eProjects = {
	'mobile-chrome': { browser: 'chromium', device: 'Pixel 7' },
	'mobile-safari': { browser: 'webkit', device: 'iPhone 15' },
	chromium: { browser: 'chromium', device: 'Desktop Chrome' },
	firefox: { browser: 'firefox', device: 'Desktop Firefox' }
} as const satisfies Record<string, E2eProject>;

export type E2eProjectName = keyof typeof e2eProjects;

export function isE2eProjectName(value: string): value is E2eProjectName {
	return Object.hasOwn(e2eProjects, value);
}

/** The one project a bare `bun run test:e2e` runs: the phone the app is built for. */
export const DEFAULT_E2E_PROJECT: E2eProjectName = 'mobile-chrome';
