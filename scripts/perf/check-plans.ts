import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { formatPlans, planStatements } from './sql-plans.ts';
import { formatCommitted } from './prettier-format.ts';

/**
 * `check:perf-plans`: re-runs instrument 4 and diffs it against the committed
 * `quality/perf-plans.md`, so a change that turns an index seek into a scan
 * fails a check instead of waiting to be noticed in a slow request.
 *
 * Not wired into any CI tier by this PR — this needs the catalog file (or
 * falls back to the fixture schema, which does not reflect production row
 * counts) and takes the time `bun run build` plus a migration run cost, and
 * whether that is worth a gate is Gabriel's call to make separately.
 */
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const committedPath = path.join(projectRoot, 'quality', 'perf-plans.md');

async function main(): Promise<void> {
	const committed = await readFile(committedPath, 'utf8').catch(() => null);
	if (committed === null) {
		console.error(`No committed plans at ${path.relative(projectRoot, committedPath)}.`);
		console.error('Run `bun run perf:measure -- --baseline` (via node) to create one.');
		process.exitCode = 1;
		return;
	}
	const fresh = await formatCommitted(
		formatPlans(await planStatements(projectRoot)),
		committedPath
	);
	if (fresh === committed) {
		console.log('SQLite plans match the committed baseline.');
		return;
	}
	console.error('SQLite plans differ from the committed baseline.');
	console.error(`Committed: ${path.relative(projectRoot, committedPath)}`);
	console.error('Re-run `perf:measure --baseline` and review the diff before committing it.');
	process.exitCode = 1;
}

await main();
