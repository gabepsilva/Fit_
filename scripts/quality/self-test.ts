import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import type { GateFixture } from './fixtures';
import { fixtures } from './fixtures';
import { pooled } from './pool';
import { captureStatus } from '../security/shared';

/**
 * Proves each gate fails on input it claims to reject; `bun run ci` passing on
 * an unmodified tree is the other half of the proof.
 */

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const reportPath = path.join(projectRoot, 'reports', 'quality', 'self-test.json');
const excluded = [
	'./.git',
	'./node_modules',
	'./.svelte-kit',
	'./build',
	'./coverage',
	'./reports',
	'./test-results',
	'./playwright-report',
	'./.stryker-tmp',
	// Multi-GB gitignored pipeline data; copying it into every fixture template
	// would exhaust the tmpfs. `stryker.config.mjs` ignores it for the same reason.
	'./data',
	'./.security-cache/images',
	'./.security-cache/trivy'
];

interface FixtureResult {
	name: string;
	gate: string;
	description: string;
	proven: boolean;
	exitCode: number;
	reason: string;
	durationMs: number;
}

const skipDocker = process.argv.includes('--skip-docker');
const skipBrowser = process.argv.includes('--skip-browser');
const onlyIndex = process.argv.indexOf('--only');
const onlyName = onlyIndex === -1 ? undefined : process.argv[onlyIndex + 1];
if (onlyIndex !== -1 && onlyName === undefined) throw new Error('--only requires a fixture name.');
const selectedFixtures =
	onlyName === undefined ? fixtures : fixtures.filter((fixture) => fixture.name === onlyName);
if (selectedFixtures.length === 0) throw new Error(`Unknown gate fixture: ${onlyName ?? ''}`);

async function run(cwd: string, command: string, args: string[]): Promise<number> {
	const { exitCode } = await captureStatus(command, args, { cwd, env: fixtureEnv });
	return exitCode;
}

async function runCaptured(
	cwd: string,
	command: string,
	args: string[]
): Promise<{ exitCode: number; output: string }> {
	return captureStatus(command, args, { cwd, env: fixtureEnv });
}

/**
 * Each fixture is an independent tree copy, so they run in parallel, but each
 * spawns nested test runners of its own, so the pool is a quarter of the cores.
 */
const concurrency = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 4)));

/**
 * Sibling fixtures run concurrently, so a nested mutation run is capped at two
 * workers.
 */
const fixtureEnv: NodeJS.ProcessEnv = {
	...process.env,
	MUTATION_BASE: 'HEAD',
	STRYKER_CONCURRENCY: '2'
};

/** Fixtures mutate their workspace, so a workspace must never be the real tree. */
function assertDisposable(workspace: string): void {
	if (path.resolve(workspace) === path.resolve(projectRoot)) {
		throw new Error('Refusing to apply a fixture to the project root.');
	}
}

/** A pristine copy of the working tree, including uncommitted work. */
async function createTemplate(root: string): Promise<string> {
	const template = path.join(root, 'template');
	await mkdir(template, { recursive: true });
	const excludeArgs = excluded.map((entry) => `--exclude=${entry}`);
	const copied = await run(projectRoot, 'bash', [
		'-c',
		`tar -cf - ${excludeArgs.join(' ')} . | tar -xf - -C ${JSON.stringify(template)}`
	]);
	if (copied !== 0) throw new Error('Could not copy the working tree.');
	// A fresh .git per template: reusing the checkout's would share one index
	// between concurrent fixtures and shift the diff base.
	await run(template, 'git', ['init']);
	await run(template, 'git', ['add', '-A']);
	const committed = await run(template, 'git', [
		'-c',
		'user.name=Fit gate fixture',
		'-c',
		'user.email=fixture@example.test',
		'commit',
		'-m',
		'fixture baseline'
	]);
	if (committed !== 0) throw new Error('Could not commit the fixture baseline.');
	await symlink(path.join(projectRoot, 'node_modules'), path.join(template, 'node_modules'), 'dir');
	// Stryker resolves the Vitest projects before its sandbox can regenerate
	// the gitignored tsconfig, so the template needs this synced SvelteKit config.
	const synced = await run(template, 'bunx', ['svelte-kit', 'sync']);
	if (synced !== 0) throw new Error('Could not prepare the fixture SvelteKit config.');
	return template;
}

function proofReason(
	fixture: GateFixture,
	exitCode: number,
	output: string,
	intendedFailure: boolean,
	intendedStatus: boolean
): string {
	if (exitCode === 0) return 'the gate accepted input it claims to reject';
	if (!intendedStatus) {
		return `gate exited ${exitCode}, not the ${String(fixture.expectedExitCode)} this failure mode must report\n${output.slice(-10_000)}`;
	}
	if (!intendedFailure) {
		return `gate failed without expected evidence: ${fixture.failureIncludes ?? ''}\n${output.slice(-10_000)}`;
	}
	return 'gate failed as required';
}

async function proveFixture(
	fixture: GateFixture,
	template: string,
	root: string
): Promise<FixtureResult> {
	const startedAt = Date.now();
	const workspace = path.join(root, fixture.name);
	const base: FixtureResult = {
		name: fixture.name,
		gate: fixture.gate,
		description: fixture.description,
		proven: false,
		exitCode: 0,
		reason: '',
		durationMs: 0
	};

	if ((fixture.docker === true && skipDocker) || (fixture.browser === true && skipBrowser)) {
		return { ...base, proven: true, reason: 'skipped', durationMs: Date.now() - startedAt };
	}

	assertDisposable(workspace);
	await run(root, 'cp', ['-a', `${template}/.`, workspace]);
	await fixture.apply(workspace);
	if (fixture.baselinePaths !== undefined) {
		await run(workspace, 'git', ['add', '--', ...fixture.baselinePaths]);
		const committed = await run(workspace, 'git', [
			'-c',
			'user.name=Fit gate fixture',
			'-c',
			'user.email=fixture@example.test',
			'commit',
			'-m',
			'fixture support test'
		]);
		if (committed !== 0) throw new Error(`Could not commit support files for ${fixture.name}.`);
	}
	// Scanners read tracked files, so fixtures are staged; one stays untracked
	// on purpose to prove changed-file discovery finds untracked code.
	if (fixture.stage !== false) await run(workspace, 'git', ['add', '-A']);

	for (const step of fixture.prepare ?? []) {
		const prepareCode = await run(workspace, 'bun', ['run', step]);
		if (prepareCode !== 0) {
			return {
				...base,
				exitCode: prepareCode,
				reason: `preparation step ${step} failed`,
				durationMs: Date.now() - startedAt
			};
		}
	}

	const { exitCode, output } = await runCaptured(workspace, 'bun', ['run', fixture.gate]);
	await rm(workspace, { recursive: true, force: true });
	const intendedFailure =
		fixture.failureIncludes === undefined || output.includes(fixture.failureIncludes);
	// A gate that reports two kinds of red has to be proven on the status too:
	// the message alone cannot show that a crash is not filed as a finding.
	const intendedStatus =
		fixture.expectedExitCode === undefined || exitCode === fixture.expectedExitCode;

	return {
		...base,
		proven: exitCode !== 0 && intendedFailure && intendedStatus,
		exitCode,
		reason: proofReason(fixture, exitCode, output, intendedFailure, intendedStatus),
		durationMs: Date.now() - startedAt
	};
}

const root = await mkdtemp(path.join(tmpdir(), 'fit-self-test-'));
console.log(`Gate self-test: ${selectedFixtures.length} fixtures, ${concurrency} at a time.\n`);

let results: FixtureResult[];
try {
	const template = await createTemplate(root);
	const shared = selectedFixtures.filter((fixture) => fixture.exclusive !== true);
	const exclusive = selectedFixtures.filter((fixture) => fixture.exclusive === true);
	const runFixture = async (fixture: GateFixture): Promise<FixtureResult> => {
		const result = await proveFixture(fixture, template, root);
		// Printed on completion, not in plan order, so a slow fixture never hides
		// the ones that already finished.
		const status = result.reason === 'skipped' ? 'skip' : result.proven ? 'pass' : 'FAIL';
		console.log(`${status}  ${result.gate.padEnd(20)} ${result.name}`);
		return result;
	};
	const sharedResults = await pooled(shared, concurrency, runFixture);
	const exclusiveResults: FixtureResult[] = [];
	for (const fixture of exclusive) exclusiveResults.push(await runFixture(fixture));
	const byName = new Map(
		[...sharedResults, ...exclusiveResults].map((result) => [result.name, result])
	);
	results = selectedFixtures.map((fixture) => {
		const result = byName.get(fixture.name);
		if (result === undefined) throw new Error(`Fixture ${fixture.name} did not run.`);
		return result;
	});
} finally {
	await rm(root, { recursive: true, force: true });
}

const unproven = results.filter((result) => !result.proven);
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(
	reportPath,
	`${JSON.stringify({ ok: unproven.length === 0, gatesProven: results.length - unproven.length, results }, null, 2)}\n`
);

console.log(
	`\nGate self-test: ${results.length - unproven.length}/${results.length} gates proven.`
);

if (unproven.length > 0) {
	for (const result of unproven) {
		console.error(`  ${result.gate} (${result.name}): ${result.reason}`);
	}
	process.exitCode = 1;
}
