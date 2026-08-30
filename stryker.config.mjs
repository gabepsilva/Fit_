import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';

const { mutation } = JSON.parse(
	readFileSync(new URL('./quality/thresholds.json', import.meta.url), 'utf8')
);

const scopeFile = process.env.FIT_MUTATION_SCOPE;
const scopedMutate =
	scopeFile === undefined
		? null
		: JSON.parse(readFileSync(scopeFile, 'utf8')).files.map(({ path }) => path);

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
// Nine workers are the measured stable ceiling on the development workstation:
// ten allowed a Chromium-backed worker to be OOM-killed and made the next
// back-to-back Vitest project initialization unreliable.
const MAX_LOCAL_WORKERS = 9;

/**
 * A hosted runner has four shared cores, so it keeps one in hand for the job's
 * own overhead rather than idling half the machine; a 32-core workstation
 * should not idle for half an hour. `availableParallelism` respects cgroup
 * limits, so a container gets its own share rather than the host's, and
 * `availableMemory` moves with whatever else is running right now.
 * `STRYKER_CONCURRENCY` overrides the lot.
 */
function concurrency() {
	const override = Number(process.env.STRYKER_CONCURRENCY);
	if (Number.isInteger(override) && override > 0) return override;
	// A hosted runner has four cores and does nothing else, so it can spare all
	// but one. A workstation is somebody's desk and keeps a share back.
	const byCores = process.env.CI
		? availableParallelism() - 1
		: Math.floor(availableParallelism() * LOCAL_CORE_SHARE);
	const byMemory = Math.floor((process.availableMemory() * MEMORY_HEADROOM) / WORKER_MEMORY_BYTES);
	const stableLocalLimit = process.env.CI ? Number.POSITIVE_INFINITY : MAX_LOCAL_WORKERS;
	return Math.max(2, Math.min(byCores, byMemory, stableLocalLimit));
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
	mutate: scopedMutate ?? [
		'src/lib/**/*.ts',
		'!src/**/*.{test,spec,e2e}.ts',
		// Seed food rows and the two literal label lookup tables. Mutants here are
		// food names, aliases and label strings.
		'!src/lib/domain/food-catalog.ts',
		// Seed exercise rows, form cues and starter routines. Mutants here are
		// movement names, cue wording and template loads — data, not logic. What
		// reads it (the library index, the group filter, the template copy) is
		// still mutated in exercises.ts.
		'!src/lib/domain/exercise-catalog.ts',
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
		// The nutrition ETL pipeline: several gigabytes of Python environment,
		// data extracts and a food database. Stryker copies what it does not
		// ignore into every sandbox, which exhausted the disk quota before a
		// single mutant ran, and failed first on a symlink inside it.
		'data/**',
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
	htmlReporter: {
		fileName:
			process.env.FIT_MUTATION_REPORT?.replace(/mutation\.json$/, 'mutation.html') ??
			'reports/mutation/mutation.html'
	},
	jsonReporter: {
		fileName: process.env.FIT_MUTATION_REPORT ?? 'reports/mutation/mutation.json'
	},
	// Keep the historical aggregate break as a first defense. The wrapper still
	// applies the governing strict killed-only/per-file verdict where required,
	// because Stryker's built-in score credits timeouts.
	thresholds: {
		high: mutation.high,
		low: mutation.low,
		break: mutation.break
	},
	// Only re-mutate what changed. The file is cached in CI, not committed.
	incremental: true,
	incrementalFile:
		process.env.FIT_MUTATION_INCREMENTAL ?? 'reports/mutation/stryker-incremental.json',
	concurrency: concurrency(),
	cleanTempDir: 'always'
};
