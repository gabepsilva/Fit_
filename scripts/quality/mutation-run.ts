import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { captureStatus } from '../security/shared';
import { prepareMutationCache, recordMutationCache } from './mutation-cache';
import { buildMutationScope } from './mutation-scope';
import { parseMutationPolicy, type MutationLane } from './mutation-types';
import { mutationReviewLedgerFailures, verifyMutationFiles } from './mutation-verdict';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

interface Arguments {
	lane: MutationLane;
	base?: string;
	forceCold: boolean;
	scopeOnly: boolean;
}

function parseArguments(argv: string[]): Arguments {
	const lane = argv[0];
	if (!['security', 'changed-node', 'changed-client', 'full'].includes(lane ?? '')) {
		throw new Error(
			'Usage: mutation-run.ts <security|changed-node|changed-client|full> [--base REF] [--force-cold] [--scope-only]'
		);
	}
	let base: string | undefined;
	let forceCold = false;
	let scopeOnly = false;
	for (let index = 1; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === '--force-cold') forceCold = true;
		else if (argument === '--scope-only') scopeOnly = true;
		else if (argument === '--base') {
			base = argv[index + 1];
			if (base === undefined) throw new Error('--base requires a git ref.');
			index += 1;
		} else throw new Error(`Unknown argument: ${argument ?? ''}`);
	}
	return {
		lane: lane as MutationLane,
		...(base === undefined ? {} : { base }),
		forceCold,
		scopeOnly
	};
}

/**
 * `cleanTempDir: 'always'` only runs when Stryker exits normally, and a
 * mutation run is long enough that interrupting one is routine. Each abandoned
 * sandbox is a full copy of the checkout, so they accumulate tens of gigabytes
 * inside the tree — where every tool that walks it then has to be told to skip
 * them. The next run owns the directory anyway, so it clears it on the way in.
 */
async function clearStrykerSandboxes(root: string): Promise<void> {
	await rm(path.join(root, '.stryker-tmp'), { recursive: true, force: true });
}

export async function resetMutationResultArtifacts(directory: string): Promise<void> {
	await mkdir(directory, { recursive: true });
	await Promise.all(
		['scope.json', 'mutation.json', 'verdict.json'].map((file) =>
			rm(path.join(directory, file), { force: true })
		)
	);
}

export async function runMutation(options: Arguments): Promise<number> {
	const directory = path.join(projectRoot, 'reports', 'mutation', options.lane);
	const scopePath = path.join(directory, 'scope.json');
	const reportPath = path.join(directory, 'mutation.json');
	const verdictPath = path.join(directory, 'verdict.json');
	const incrementalPath = path.join(directory, 'incremental.json');
	const metadataPath = path.join(directory, 'cache.json');
	const policyPath = path.join(projectRoot, 'quality', 'mutation-policy.json');
	const ledgerPath = path.join(projectRoot, 'quality', 'mutation-equivalents.json');
	await clearStrykerSandboxes(projectRoot);
	await resetMutationResultArtifacts(directory);
	parseMutationPolicy(JSON.parse(await readFile(policyPath, 'utf8')) as unknown);
	const ledgerFailures = mutationReviewLedgerFailures(
		JSON.parse(await readFile(ledgerPath, 'utf8')) as unknown
	);
	if (ledgerFailures.length > 0) {
		for (const failure of ledgerFailures) console.error(failure);
		return 1;
	}
	if (options.forceCold)
		await Promise.all([rm(incrementalPath, { force: true }), rm(metadataPath, { force: true })]);

	const scope = await buildMutationScope(projectRoot, options.lane, options.base);
	await writeFile(scopePath, `${JSON.stringify(scope, null, '\t')}\n`);
	if (options.scopeOnly) {
		console.log(`${options.lane}: ${scope.files.length} scoped file(s).`);
		return 0;
	}
	if (scope.fallback === 'non-mutated-runtime-input-changed') {
		await Promise.all([rm(incrementalPath, { force: true }), rm(metadataPath, { force: true })]);
	}
	const startedAt = Date.now();
	let strykerExit = 0;
	let digest = '';
	if (scope.files.length === 0 && options.lane.startsWith('changed-')) {
		await writeFile(reportPath, `${JSON.stringify({ files: {} }, null, '\t')}\n`);
	} else {
		digest = await prepareMutationCache({
			projectRoot,
			lane: options.lane,
			incrementalPath,
			metadataPath
		});
		const result = await captureStatus('bunx', ['stryker', 'run', 'stryker.config.mjs'], {
			cwd: projectRoot,
			stream: true,
			env: {
				...process.env,
				FIT_MUTATION_LANE: options.lane,
				FIT_MUTATION_PROJECT: scope.project,
				FIT_MUTATION_SCOPE: scopePath,
				FIT_MUTATION_REPORT: reportPath,
				FIT_MUTATION_INCREMENTAL: incrementalPath
			}
		});
		strykerExit = result.exitCode;
	}

	let verdict;
	try {
		verdict = await verifyMutationFiles({
			projectRoot,
			lane: options.lane,
			scopePath,
			reportPath,
			policyPath,
			ledgerPath,
			verdictPath,
			startedAt
		});
	} catch (error) {
		await Promise.all([rm(incrementalPath, { force: true }), rm(metadataPath, { force: true })]);
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}

	if (strykerExit !== 0 || !verdict.ok) {
		await Promise.all([rm(incrementalPath, { force: true }), rm(metadataPath, { force: true })]);
		for (const failure of verdict.failures) console.error(`  ${failure}`);
		return 1;
	}
	if (digest !== '') await recordMutationCache(metadataPath, digest);
	if (options.lane === 'full') {
		console.log(
			`full: ${verdict.mutationScore.toFixed(2)}% legacy Stryker-compatible score ` +
				`(${verdict.killed} killed, ${verdict.timeout} timeout, ${verdict.survived} survived, ` +
				`${verdict.noCoverage} uncovered, ${verdict.errors} invalid); ` +
				`${scope.files.length} scoped file(s).`
		);
	} else if (verdict.verdictMode === 'strict-changed-with-legacy-background') {
		console.log(
			`${options.lane}: ${verdict.strictKilledScore.toFixed(2)}% killed-only for ` +
				`${verdict.strictFiles} changed production file(s) (${verdict.strictKilled}/${verdict.strictTotal}); ` +
				`${verdict.backgroundMutationScore?.toFixed(2) ?? '100.00'}% legacy-compatible score for unchanged fallback files; ` +
				`${scope.files.length} scoped file(s).`
		);
	} else {
		console.log(
			`${options.lane}: ${verdict.strictKilledScore.toFixed(2)}% strict killed-only ` +
				`(${verdict.strictKilled}/${verdict.strictTotal}); ${scope.files.length} scoped file(s).`
		);
	}
	return 0;
}

if (import.meta.main) {
	const result = await runMutation(parseArguments(process.argv.slice(2)));
	process.exitCode = result;
}
