import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import type { GateFixture } from './fixtures';
import { fixtures } from './fixtures';
import { captureStatus } from '../security/shared';

/**
 * Proves each gate fails on input it claims to reject. The clean control is the
 * gate run itself: `bun run ci` passing on an unmodified tree is the other half
 * of the proof, so this suite only has to demonstrate the failing direction.
 */

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const reportPath = path.join(projectRoot, 'reports', 'quality', 'self-test.json');
const excluded = [
	'./node_modules',
	'./.svelte-kit',
	'./build',
	'./coverage',
	'./reports',
	'./test-results',
	'./playwright-report',
	'./.stryker-tmp',
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

async function run(cwd: string, command: string, args: string[]): Promise<number> {
	const { exitCode } = await captureStatus(command, args, { cwd });
	return exitCode;
}

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
	await symlink(path.join(projectRoot, 'node_modules'), path.join(template, 'node_modules'), 'dir');
	return template;
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
	// The suppression scanner reads tracked files, so the fixture must be staged.
	await run(workspace, 'git', ['add', '-A']);

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

	const exitCode = await run(workspace, 'bun', ['run', fixture.gate]);
	await rm(workspace, { recursive: true, force: true });

	return {
		...base,
		proven: exitCode !== 0,
		exitCode,
		reason:
			exitCode === 0 ? 'the gate accepted input it claims to reject' : 'gate failed as required',
		durationMs: Date.now() - startedAt
	};
}

const root = await mkdtemp(path.join(tmpdir(), 'fit-self-test-'));
console.log(`Gate self-test: ${fixtures.length} fixtures.\n`);

const results: FixtureResult[] = [];
try {
	const template = await createTemplate(root);
	for (const fixture of fixtures) {
		const result = await proveFixture(fixture, template, root);
		results.push(result);
		const status = result.reason === 'skipped' ? 'skip' : result.proven ? 'pass' : 'FAIL';
		console.log(`${status}  ${result.gate.padEnd(20)} ${result.name}`);
	}
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
