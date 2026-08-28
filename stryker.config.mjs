import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';

const { mutation } = JSON.parse(
	readFileSync(new URL('./quality/thresholds.json', import.meta.url), 'utf8')
);

/**
 * Every Stryker worker starts its own vitest, and vitest sizes its pool to the
 * whole machine unless told otherwise — so raising `concurrency` alone would
 * ask for one machine per worker. Measured here: twelve workers produced 2,300
 * threads on 32 cores, and a quarter of the mutants timed out. A timeout counts
 * as a kill, so the score would have gone *up* while the measurement fell apart.
 *
 * `vite.config.ts` reads this and runs one test file at a time inside a worker,
 * which is what lets `concurrency` below mean what it says.
 */
process.env.FIT_MUTATION_RUN = '1';

/** How much of a workstation's cores mutation testing may take. */
const LOCAL_CORE_SHARE = 0.85;

/**
 * Memory runs out before cores do. Every worker carries a vitest, and the
 * component and store specs bring a headless Chromium with them, so 27 workers
 * exhausted 29 GB and pushed a fifth of the mutants into false timeouts. Budget
 * a gigabyte each and leave a third of what is free for everything else on the
 * machine, so a mutation run never becomes the reason something else is killed.
 */
const WORKER_MEMORY_BYTES = 1024 ** 3;
const MEMORY_HEADROOM = 0.7;

/**
 * A hosted CI runner has two to four shared cores, so it keeps a conservative
 * pair of workers; a 32-core workstation should not idle for half an hour.
 * `availableParallelism` respects cgroup limits, so a container gets its own
 * share rather than the host's, and `availableMemory` moves with whatever else
 * is running right now. `STRYKER_CONCURRENCY` overrides the lot.
 */
function concurrency() {
	const override = Number(process.env.STRYKER_CONCURRENCY);
	if (Number.isInteger(override) && override > 0) return override;
	if (process.env.CI) return 2;
	const byCores = Math.floor(availableParallelism() * LOCAL_CORE_SHARE);
	const byMemory = Math.floor((process.availableMemory() * MEMORY_HEADROOM) / WORKER_MEMORY_BYTES);
	return Math.max(2, Math.min(byCores, byMemory));
}

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
	coverageAnalysis: 'perTest',
	// This gate enforces "reusable logic reaches the mutation score", so the glob
	// has to select logic and leave out seed data. A mutant inside a fixture is not
	// a defect the tests should catch: killing it would mean asserting the fixture's
	// exact contents, which pins wording and sample numbers that are free to change.
	// Everything that reads the data — indexes, scaling, macros, the parser, the
	// adaptive TDEE model — is still mutated.
	mutate: [
		'src/lib/**/*.ts',
		'!src/**/*.{test,spec}.ts',
		// Seed food rows and the two literal label lookup tables. Mutants here are
		// food names, aliases and label strings.
		'!src/lib/domain/food-catalog.ts',
		// Seed recipe rows. Mutants here are recipe names, notes and portions.
		'!src/lib/domain/recipe-book.ts',
		// Demo-journal fixture builder. Its meal templates are data, and the jitter
		// and weight-trend arithmetic exists only to make sample history look
		// lived-in; demo-seed.spec.ts asserts the properties that matter (gaps in the
		// log, varied sources, enough history for adaptive TDEE) without freezing the
		// numbers, and nothing else should.
		'!src/lib/domain/demo-seed.ts'
	],
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
	concurrency: concurrency(),
	cleanTempDir: 'always'
};
