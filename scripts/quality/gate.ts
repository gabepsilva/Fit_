import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import type { GateStep } from './gates';
import { ciJobs, isCiJobName, isTierName, tiers } from './gates';
import { captureStatus } from '../security/shared';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const reportDirectory = path.join(projectRoot, 'reports', 'quality');
const logDirectory = path.join(reportDirectory, 'logs');
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

async function runStep(step: GateStep, stream: boolean): Promise<StepRun> {
	const logPath = path.join(logDirectory, `${step.name.replace(/:/g, '-')}.log`);
	const startedAt = Date.now();
	const { exitCode, output } = await captureStatus('bun', ['run', step.name], {
		stream,
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

await rm(logDirectory, { recursive: true, force: true });
await mkdir(logDirectory, { recursive: true });

const startedAt = new Date();
const started = Date.now();
const results: StepResult[] = [];
const failureOutput = new Map<string, string>();

console.log(`Gate ${label}: ${selected.length} steps, run to completion.\n`);

for (const step of selected) {
	const { result, output } = await runStep(step, options.stream);
	results.push(result);
	if (!result.ok) failureOutput.set(result.name, output);
	console.log(
		`${result.ok ? 'pass' : 'FAIL'}  ${formatDuration(result.durationMs)}  ${result.name}`
	);
	if (!result.ok && options.bail) break;
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

await writeFile(
	path.join(reportDirectory, `gate-${label.replace(/:/g, '-')}.json`),
	`${JSON.stringify(report, null, 2)}\n`
);

for (const result of failed) printFailure(result, failureOutput.get(result.name) ?? '');

console.log(
	`\nGate ${label}: ${results.length - failed.length}/${results.length} passed in ${formatDuration(report.durationMs)}.`
);
if (failed.length > 0) {
	console.error(`Failed steps: ${failed.map((result) => result.name).join(', ')}`);
	process.exitCode = 1;
}
