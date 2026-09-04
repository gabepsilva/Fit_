import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { tiers, type TierName } from './gates';

/**
 * A lane that does not gate a pull request only exists if something else runs
 * it. `audit` (the full-tree mutation re-verification, taken off the merge gate
 * for runner cost) and `nightly` (Trivy and ZAP, never a merge gate because
 * their findings change without a code change) are both in that position, so
 * this proves each still runs on a schedule and still reaches a human when it
 * goes red. Without it, deleting a cron line silently retires a whole tier.
 *
 * `check:ci-contract` is the same idea for the jobs that do gate a merge; this
 * is deliberately a separate file because it answers a different question and
 * reads a different set of workflows.
 */

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const workflowDirectory = path.join(projectRoot, '.github', 'workflows');

const scheduledTiers = ['audit', 'nightly'] as const satisfies readonly TierName[];

interface Workflow {
	name: string;
	source: string;
}

/** A workflow with at least one `cron:` entry under its triggers. */
function isScheduled(source: string): boolean {
	return /^\s*-\s*cron:/m.test(source);
}

/**
 * Script names that are just an alias for the tier, read from package.json
 * rather than listed here, so a renamed alias cannot drift out of this check.
 */
function tierAliases(scripts: Record<string, string>, tier: TierName): string[] {
	return Object.entries(scripts)
		.filter(([, command]) => new RegExp(String.raw`gate\.ts ${tier}(\s|$)`).test(command))
		.map(([name]) => name);
}

/** The tier itself, one of its aliases, or every step it declares. */
function invokesTier(source: string, tier: TierName, aliases: string[]): boolean {
	if (source.includes(`gate.ts ${tier}`)) return true;
	if (aliases.some((alias) => source.includes(`bun run ${alias}`))) return true;
	return tiers[tier].every((step) => source.includes(`bun run ${step.name}`));
}

/**
 * A scheduled run nobody reads is worth nothing. Surfacing means the workflow
 * can open or update an issue: it holds `issues: write` and calls
 * `issues.create`.
 */
function surfacesFailure(source: string): boolean {
	return source.includes('issues: write') && source.includes('issues.create');
}

const [packageJson, entries] = await Promise.all([
	readFile(path.join(projectRoot, 'package.json'), 'utf8'),
	readdir(workflowDirectory)
]);
const scripts = (JSON.parse(packageJson) as { scripts?: Record<string, string> }).scripts ?? {};
const workflows: Workflow[] = await Promise.all(
	entries
		.filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
		.map(async (name) => ({
			name,
			source: await readFile(path.join(workflowDirectory, name), 'utf8')
		}))
);
const scheduledWorkflows = workflows.filter((workflow) => isScheduled(workflow.source));

const failures: string[] = [];
const wired: string[] = [];

for (const tier of scheduledTiers) {
	const steps = tiers[tier].map((step) => step.name);
	if (steps.length === 0) {
		failures.push(`Tier "${tier}" declares no steps, so scheduling it proves nothing.`);
		continue;
	}
	const aliases = tierAliases(scripts, tier);
	const runners = scheduledWorkflows.filter((workflow) =>
		invokesTier(workflow.source, tier, aliases)
	);
	if (runners.length === 0) {
		failures.push(
			`Tier "${tier}" runs on no schedule: no scheduled workflow invokes ${steps.join(', ')}.`
		);
		continue;
	}
	const silent = runners.filter((workflow) => !surfacesFailure(workflow.source));
	for (const workflow of silent) {
		failures.push(
			`Scheduled workflow ${workflow.name} runs the "${tier}" tier but cannot surface a failure: it needs issues: write and an issues.create step.`
		);
	}
	wired.push(`${tier} (${runners.map((workflow) => workflow.name).join(', ')})`);
}

if (failures.length === 0) {
	console.log(`Schedule contract: ${wired.join('; ')} run on a schedule and report failures.`);
} else {
	for (const failure of failures) console.error(failure);
	process.exitCode = 1;
}
