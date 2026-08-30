import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import type { GateStep } from './gates';
import { ciJobs, isCiJobName, isTierName, tiers } from './gates';
import { gateLogDirectory, gateReportPath } from './gate-paths';
import { pooled } from './pool';
import { captureStatus } from '../security/shared';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const reportDirectory = path.join(projectRoot, 'reports', 'quality');
const failureLogLines = 60;

interface StepResult {
	name: string;
	purpose: string;
	command: string;
	ok: boolean;
	exitCode: number;
	durationMs: number;
	log: string;
	artifacts: string[];
}

interface Options {
	tier: string;
	bail: boolean;
	stream: boolean;
	only: string[];
	job: string | null;
}

function parseArguments(argv: string[]): Options {
	const [tier, ...rest] = argv;
	const only: string[] = [];
	let bail = false;
	let stream = false;
	let job: string | null = null;

	for (let index = 0; index < rest.length; index += 1) {
		const argument = rest[index];
		if (argument === '--bail') bail = true;
		else if (argument === '--stream') stream = true;
		else if (argument === '--only') {
			const value = rest[index + 1];
			if (value === undefined) throw new Error('--only requires a comma-separated step list.');
			only.push(...value.split(',').filter(Boolean));
			index += 1;
		} else if (argument === '--job') {
			const value = rest[index + 1];
			if (value === undefined) throw new Error('--job requires a CI job name.');
			job = value;
			index += 1;
		} else throw new Error(`Unknown argument: ${argument ?? ''}`);
	}

	if (tier === undefined) throw new Error(`Usage: gate.ts <${Object.keys(tiers).join('|')}>`);
	return { tier, bail, stream, only, job };
}

function formatDuration(milliseconds: number): string {
	return milliseconds < 1000
		? `${milliseconds}ms`
		: `${(milliseconds / 1000).toFixed(1)}s`.padStart(6, ' ');
}

interface StepRun {
	result: StepResult;
	output: string;
}

async function runStep(
	step: GateStep,
	stream: boolean,
	logDirectory: string,
	signal: AbortSignal
): Promise<StepRun> {
	const logPath = path.join(logDirectory, `${step.name.replace(/:/g, '-')}.log`);
	const startedAt = Date.now();
	const { exitCode, output } = await captureStatus('bun', ['run', step.name], {
		stream,
		signal,
		env: { ...process.env, FORCE_COLOR: '0' }
	});
	await writeFile(logPath, output);

	return {
		output,
		result: {
			name: step.name,
			purpose: step.purpose,
			command: `bun run ${step.name}`,
			ok: exitCode === 0,
			exitCode,
			durationMs: Date.now() - startedAt,
			log: path.relative(projectRoot, logPath),
			artifacts: step.artifacts ?? []
		}
	};
}

/**
 * How many `concurrent` steps run at once. Sized well under the core count on
 * purpose: a step is not one process. `lint` alone peaks near 5 GB across its
 * own ESLint workers, and four static steps side by side measured 6.4 GB here,
 * so a two-core hosted runner stays sequential and only a workstation spends
 * the cores. `--stream` interleaves child output, so it forces one at a time.
 */
function poolWidth(stream: boolean): number {
	if (stream) return 1;
	return Math.max(1, Math.min(4, Math.floor(availableParallelism() / 4)));
}

/**
 * `check` runs `svelte-kit sync` inside its own script, rewriting `.svelte-kit/`
 * while `lint`, `knip` and `check:scripts` read the generated types beside it.
 * Syncing once up front removes that race; the step's own sync then finds the
 * output current and does nothing.
 */
async function syncGeneratedTypes(): Promise<void> {
	const { exitCode } = await captureStatus(
		path.join(projectRoot, 'node_modules', '.bin', 'svelte-kit'),
		['sync'],
		{ env: { ...process.env, FORCE_COLOR: '0' } }
	);
	if (exitCode !== 0) throw new Error(`svelte-kit sync failed with exit code ${exitCode}.`);
}

function printFailure(result: StepResult, output: string): void {
	const lines = output.split('\n');
	const tail = lines.length > failureLogLines ? lines.slice(-failureLogLines) : lines;
	console.error(`\n--- ${result.name} failed (exit ${result.exitCode}) ---`);
	if (lines.length > tail.length) {
		console.error(`[${lines.length - tail.length} earlier lines in ${result.log}]`);
	}
	console.error(tail.join('\n').trimEnd());
}

const options = parseArguments(process.argv.slice(2));
if (!isTierName(options.tier)) {
	throw new Error(`Unknown tier "${options.tier}". Known tiers: ${Object.keys(tiers).join(', ')}.`);
}

if (options.job !== null && !isCiJobName(options.job)) {
	throw new Error(
		`Unknown CI job "${options.job}". Known jobs: ${Object.keys(ciJobs).join(', ')}.`
	);
}

// A CI job is a named slice of the ci tier, so the workflow never repeats a step list.
const planned = options.job === null ? tiers[options.tier] : ciJobs[options.job];
const selected = planned.filter(
	(step) => options.only.length === 0 || options.only.includes(step.name)
);
if (selected.length === 0) throw new Error(`No steps matched --only ${options.only.join(',')}.`);
const label = options.job === null ? options.tier : `${options.tier}-${options.job}`;
const logDirectory = gateLogDirectory(reportDirectory, label);

await rm(logDirectory, { recursive: true, force: true });
await mkdir(logDirectory, { recursive: true });

const startedAt = new Date();
const started = Date.now();
const runs = new Map<string, StepRun>();
const width = poolWidth(options.stream);
const concurrentSteps = selected.filter((step) => step.concurrent === true);
const serialSteps = selected.filter((step) => step.concurrent !== true);
// `--bail` has to mean the same thing in a pool as it did in a loop: stop at the
// first failure. Nothing new is scheduled, and the steps already in flight are
// killed rather than waited out -- without that, a hook that used to fail on
// formatting in a second would sit through the type-aware lint beside it.
const cancellation = new AbortController();
let bailed = false;

/**
 * Printed on completion rather than in plan order, so a slow step never hides
 * the ones that already finished. The report below restores the plan order.
 */
async function execute(step: GateStep): Promise<void> {
	if (bailed) return;
	let run: StepRun;
	try {
		run = await runStep(step, options.stream, logDirectory, cancellation.signal);
	} catch (error) {
		// A killed step proves nothing, so it is reported as cancelled rather than
		// as a pass or a failure. Anything else is a real problem starting it.
		if (!cancellation.signal.aborted) throw error;
		console.log(`bail  ${'cancelled'.padStart(6)}  ${step.name}`);
		return;
	}
	runs.set(step.name, run);
	console.log(
		`${run.result.ok ? 'pass' : 'FAIL'}  ${formatDuration(run.result.durationMs)}  ${run.result.name}`
	);
	if (!run.result.ok && options.bail) {
		bailed = true;
		cancellation.abort();
	}
}

// Steps run in their own process group so that cancelling one kills the tool
// under the `bun run` wrapper rather than orphaning it. That group does not
// receive the terminal's Ctrl-C, so the runner forwards it: without this, an
// interrupted gate leaves ESLint and the test runners behind.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		if (bailed) return;
		bailed = true;
		cancellation.abort();
		process.exitCode = 130;
	});
}

const plan =
	concurrentSteps.length > 1 && width > 1
		? `${selected.length} steps, ${concurrentSteps.length} of them ${width} at a time`
		: `${selected.length} steps, one at a time`;
console.log(`Gate ${label}: ${plan}, run to completion.\n`);

if (concurrentSteps.length > 1 && width > 1) await syncGeneratedTypes();
await pooled(concurrentSteps, width, execute);
for (const step of serialSteps) await execute(step);

const results: StepResult[] = [];
const failureOutput = new Map<string, string>();
for (const step of selected) {
	const run = runs.get(step.name);
	if (run === undefined) continue;
	results.push(run.result);
	if (!run.result.ok) failureOutput.set(run.result.name, run.output);
}

const failed = results.filter((result) => !result.ok);
const report = {
	tier: options.tier,
	job: options.job,
	ok: failed.length === 0,
	startedAt: startedAt.toISOString(),
	durationMs: Date.now() - started,
	stepsRun: results.length,
	stepsPlanned: selected.length,
	failed: failed.map((result) => result.name),
	steps: results
};

await writeFile(gateReportPath(reportDirectory, label), `${JSON.stringify(report, null, 2)}\n`);

for (const result of failed) printFailure(result, failureOutput.get(result.name) ?? '');

console.log(
	`\nGate ${label}: ${results.length - failed.length}/${results.length} passed in ${formatDuration(report.durationMs)}.`
);
if (failed.length > 0) {
	console.error(`Failed steps: ${failed.map((result) => result.name).join(', ')}`);
	process.exitCode = 1;
}
