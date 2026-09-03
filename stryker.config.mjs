import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { MUTATE_PATTERNS } from './quality/mutate-patterns.mjs';

const { mutation } = JSON.parse(
	readFileSync(new URL('./quality/thresholds.json', import.meta.url), 'utf8')
);

const scopeFile = process.env.FIT_MUTATION_SCOPE;
const scope =
	scopeFile === undefined
		? null
		: /** @type {{ lane: string, files: { path: string }[] }} */ (
				JSON.parse(readFileSync(scopeFile, 'utf8'))
			);
const scopedMutate = scope === null ? null : scope.files.map(({ path }) => path);

/**
 * Whether `scripts/quality/mutation-verdict.ts` is the governing rule for this
 * run, so the aggregate break below should stand down.
 *
 * The break is the legacy full-tree defense and stays exactly that. On a
 * changed lane the verdict is harder than it on every file it judges: killed
 * only, where the break also credits a timeout; per file as well as in
 * aggregate; and no tolerance at all for a timeout or an uncovered mutant. It
 * also holds unchanged fallback files to this same 80 in their own pool.
 *
 * The single place the two part company is a file the verdict excuses because
 * the change never reached mutable code. There the break would re-impose the
 * whole-file debt the verdict just lifted, and from a pool that is often one
 * file, so the lane would still go red for a rewritten comment. Leaving it on
 * would make it, not the verdict, the rule that decides such a run.
 */
const governedByVerdict = scope?.lane === 'changed-node' || scope?.lane === 'changed-client';

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
	mutate: scopedMutate ?? MUTATE_PATTERNS,
	ignorePatterns: [
		// Vite's dependency-optimizer cache. Copying it into the sandbox lets two
		// concurrent test runners re-optimize into the same directory and race on the
		// rename, which fails as ENOTEMPTY. CI hits this because the coverage step
		// populates the cache immediately before mutation runs in the same job.
		'node_modules/.vite/**',
		// The per-project caches `vite.config.ts` gives each vitest project, for the
		// same reason and with the same effect: copied in, two runners re-optimize
		// into one directory and race on the rename.
		'node_modules/.vite-*/**',
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
	// Keep the historical aggregate break as a first defense on the lanes it
	// governs. The wrapper still applies the strict killed-only/per-file verdict
	// where required, because Stryker's built-in score credits timeouts.
	thresholds: {
		high: mutation.high,
		low: mutation.low,
		break: governedByVerdict ? null : mutation.break
	},
	// Only re-mutate what changed. The file is cached in CI, not committed.
	incremental: true,
	incrementalFile:
		process.env.FIT_MUTATION_INCREMENTAL ?? 'reports/mutation/stryker-incremental.json',
	concurrency: concurrency(),
	cleanTempDir: 'always'
};
