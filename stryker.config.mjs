import { readFileSync } from 'node:fs';

const { mutation } = JSON.parse(
	readFileSync(new URL('./quality/thresholds.json', import.meta.url), 'utf8')
);

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
	coverageAnalysis: 'perTest',
	mutate: ['src/lib/**/*.ts', '!src/**/*.{test,spec}.ts'],
	ignorePatterns: [
		// Vite's dependency-optimizer cache. Copying it into the sandbox lets two
		// concurrent test runners re-optimize into the same directory and race on the
		// rename, which fails as ENOTEMPTY. CI hits this because the coverage step
		// populates the cache immediately before mutation runs in the same job.
		'node_modules/.vite/**',
		'.security-cache/**',
		'.svelte-kit/**',
		'build/**',
		'coverage/**',
		'playwright-report/**',
		'reports/**',
		'test-results/**'
	],
	disableTypeChecks: 'src/lib/**/*.ts',
	testRunner: 'vitest',
	vitest: {
		configFile: 'vite.config.ts',
		related: true
	},
	reporters: ['clear-text', 'progress', 'html', 'json'],
	htmlReporter: { fileName: 'reports/mutation/mutation.html' },
	jsonReporter: { fileName: 'reports/mutation/mutation.json' },
	thresholds: { high: mutation.high, low: mutation.low, break: mutation.break },
	// Only re-mutate what changed. The file is cached in CI, not committed.
	incremental: true,
	incrementalFile: 'reports/mutation/stryker-incremental.json',
	concurrency: 2,
	cleanTempDir: 'always'
};
