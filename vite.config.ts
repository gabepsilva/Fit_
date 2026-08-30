import { defineConfig } from 'vitest/config';
import thresholds from './quality/thresholds.json' with { type: 'json' };
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

const testProjects = [
	{
		extends: './vite.config.ts',
		test: {
			name: 'client',
			browser: {
				enabled: true,
				provider: playwright(),
				instances: [{ browser: 'chromium' as const, headless: true }]
			},
			include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
			exclude: ['src/lib/server/**']
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

const mutationProject = process.env.FIT_MUTATION_PROJECT;
const selectedTestProjects =
	mutationProject === 'server' || mutationProject === 'client'
		? testProjects.filter(({ test }) => test.name === mutationProject)
		: testProjects;

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
