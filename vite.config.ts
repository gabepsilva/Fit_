import { defineConfig } from 'vitest/config';
import thresholds from './quality/thresholds.json' with { type: 'json' };
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

/**
 * The `.svelte.` infix means "this is a client file", not "this needs a DOM",
 * so it used to send every client spec into a headless Chromium. Startup and
 * the Vite transform for that browser land in Stryker's `timeOverheadMS`,
 * which is sampled once in the sequential dry run and then applied as a flat
 * constant to every mutant run — so under N-way contention the specs with the
 * *smallest* net time have the thinnest margin, and a pure string table times
 * out where heavy logic does not.
 *
 * The specs listed here never render or mount a component and never reach for
 * `page`/`locator`/`getBy*`, so a browser buys them nothing. This array is the
 * single source of truth for the split: the browser project excludes exactly
 * what this one includes. A spec that is not listed stays in the browser
 * project — slow but correct — so a new file can never land in jsdom by
 * accident.
 */
export const DOM_FREE_CLIENT_SPECS = [
	'src/lib/auth/api.svelte.spec.ts',
	'src/lib/auth/wording.svelte.spec.ts',
	'src/lib/components/exercise/plan-options.svelte.spec.ts',
	'src/lib/components/exercise/routine-tone.svelte.spec.ts',
	'src/lib/state/log-ui.svelte.spec.ts',
	'src/lib/state/session.svelte.spec.ts',
	'src/lib/state/tend.svelte.spec.ts',
	'src/lib/ui/cn.svelte.spec.ts',
	'src/lib/ui/dictation.svelte.spec.ts',
	'src/lib/ui/download.svelte.spec.ts'
];

/**
 * Order matters, and the DOM-free project deliberately comes first.
 *
 * Stryker's vitest runner sets `bail: 1`, so a mutant run stops at the first
 * failing test. Under `coverageAnalysis: 'perTest'` a mutant in a shared module
 * — `auth/api.ts`, `state/session.svelte.ts` — is covered both by its own fast
 * unit spec and by the page and component specs that mount it in Chromium.
 * With the browser project first, the browser had to boot and transform before
 * anything could fail, and the run blew Stryker's budget: the mutant was
 * recorded as a Timeout, which Stryker credits as a kill while proving nothing.
 * Running the jsdom project first lets the unit spec fail in milliseconds, and
 * the same mutant is recorded as Killed by the assertion that actually caught it.
 */
const testProjects = [
	{
		extends: './vite.config.ts',
		test: {
			name: 'client-node',
			environment: 'jsdom',
			sequence: { groupOrder: 0 },
			setupFiles: ['./vitest-setup-client-node.ts'],
			...(process.env.FIT_MUTATION_RUN ? { pool: 'threads' as const } : {}),
			include: DOM_FREE_CLIENT_SPECS,
			exclude: ['src/lib/server/**']
		}
	},
	{
		extends: './vite.config.ts',
		test: {
			name: 'client',
			sequence: { groupOrder: 1 },
			browser: {
				enabled: true,
				provider: playwright(),
				instances: [{ browser: 'chromium' as const, headless: true }]
			},
			include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
			exclude: ['src/lib/server/**', ...DOM_FREE_CLIENT_SPECS]
		}
	},
	{
		extends: './vite.config.ts',
		test: {
			name: 'server',
			environment: 'node',
			...(process.env.FIT_MUTATION_RUN ? { pool: 'threads' as const } : {}),
			include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.{test,spec}.ts'],
			exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
		}
	}
];

/**
 * The changed-client mutation lane mutates client sources, and those sources
 * are now covered by two vitest projects. Selecting only `client` here would
 * leave every test in `client-node` unrun, turning killed mutants into silent
 * survivors — so `client` selects both.
 */
const MUTATION_PROJECTS: Record<string, readonly string[]> = {
	server: ['server'],
	client: ['client', 'client-node']
};

const mutationProject = process.env.FIT_MUTATION_PROJECT;
const selectedNames =
	mutationProject === undefined ? undefined : MUTATION_PROJECTS[mutationProject];
const selectedTestProjects =
	selectedNames === undefined
		? testProjects
		: testProjects.filter(({ test }) => selectedNames.includes(test.name));

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Pinned so `bun run build` proves a deployable artifact rather than
			// succeeding while adapting to nothing. A consuming app may swap this
			// for its own target: https://svelte.dev/docs/kit/adapters
			//
			// The Capacitor target is the one exception: a WebView has no Node to
			// run a server bundle, so that build emits a static SPA into its own
			// directory. Both are real artifacts; neither adapts to nothing.
			adapter: process.env.VITE_CAPACITOR
				? adapterStatic({
						pages: 'build-capacitor',
						assets: 'build-capacitor',
						fallback: 'index.html',
						precompress: false
					})
				: adapter()
		})
	],
	preview: {
		allowedHosts: ['host.docker.internal']
	},
	test: {
		expect: { requireAssertions: true },
		// A mutation run puts one vitest inside every Stryker worker. Left alone,
		// each of those would size its pool to the whole machine and the workers
		// would fight each other into false timeouts; `stryker.config.mjs` sets
		// this flag and owns the parallelism instead.
		...(process.env.FIT_MUTATION_RUN ? { fileParallelism: false } : {}),
		coverage: {
			provider: 'istanbul',
			reporter: ['text', 'json-summary', 'html'],
			exclude: ['src/**/*.d.ts', 'src/**/*.{test,spec}.{js,ts}'],
			// Guarded by scripts/quality/thresholds.ts; perFile stops one
			// well-covered file from masking an uncovered one.
			thresholds: thresholds.coverage
		},
		projects: selectedTestProjects
	}
});
