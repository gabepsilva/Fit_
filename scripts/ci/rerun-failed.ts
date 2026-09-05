import { capture, run } from '../security/shared';

/**
 * `ci:rerun-failed <pr-number>`: reruns the failed jobs of a PR's latest CI
 * run without a human re-typing `gh run rerun`.
 *
 * The intended case is one flaky shard — Safari is the known repeat offender,
 * see issue #125 — and rerunning it costs nothing. Several jobs failing at
 * once is a different situation: that is a real break, and rerunning it
 * quietly would burn CI minutes hiding a red build rather than surfacing it.
 * So more than one failed job is refused unless `--all-failed` says the
 * caller means it.
 */

export interface Job {
	name: string;
	conclusion: string;
}

export type RerunPlan = { action: 'rerun'; jobs: string[] } | { action: 'refuse'; reason: string };

/** Which jobs from the latest run should be rerun, or why none should be. */
export function planRerun(failedJobs: string[], allFailed: boolean): RerunPlan {
	if (failedJobs.length === 0) {
		return { action: 'refuse', reason: 'no failed job on the latest run; nothing to rerun' };
	}
	if (failedJobs.length > 1 && !allFailed) {
		return {
			action: 'refuse',
			reason:
				`${failedJobs.length} jobs failed (${failedJobs.join(', ')}); that looks like a real ` +
				'break rather than one flaky shard, so pass --all-failed to rerun them anyway'
		};
	}
	return { action: 'rerun', jobs: failedJobs };
}

/** The job named in issue #125 as the known-flaky shard, for the caller's own log-a-comment step. */
export const KNOWN_FLAKY_JOB = 'Safari';

interface Options {
	prNumber: string;
	allFailed: boolean;
}

function parseArguments(argv: string[]): Options {
	const [prNumber, ...rest] = argv;
	if (prNumber === undefined || !/^\d+$/.test(prNumber)) {
		throw new Error('Usage: rerun-failed.ts <pr-number> [--all-failed]');
	}
	const allFailed = rest.includes('--all-failed');
	const unknown = rest.filter((argument) => argument !== '--all-failed');
	if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown[0] ?? ''}`);
	return { prNumber, allFailed };
}

async function headBranch(prNumber: string): Promise<string> {
	return capture('gh', ['pr', 'view', prNumber, '--json', 'headRefName', '-q', '.headRefName']);
}

async function latestRunId(branch: string): Promise<string> {
	const id = await capture('gh', [
		'run',
		'list',
		'--branch',
		branch,
		'--limit',
		'1',
		'--json',
		'databaseId',
		'-q',
		'.[0].databaseId'
	]);
	if (id === '' || id === 'null') {
		throw new Error(`no CI run found for branch ${branch}`);
	}
	return id;
}

async function runJobs(runId: string): Promise<Job[]> {
	const output = await capture('gh', ['run', 'view', runId, '--json', 'jobs']);
	const parsed = JSON.parse(output) as { jobs: { name: string; conclusion: string }[] };
	return parsed.jobs.map(({ name, conclusion }) => ({ name, conclusion }));
}

/** The whole command: find the run, plan, and either rerun or refuse. */
export async function rerunFailed(argv: string[]): Promise<boolean> {
	const { prNumber, allFailed } = parseArguments(argv);
	const branch = await headBranch(prNumber);
	const runId = await latestRunId(branch);
	const jobs = await runJobs(runId);
	const failedJobs = jobs.filter((job) => job.conclusion === 'failure').map((job) => job.name);

	console.log(
		failedJobs.length === 0
			? `Run ${runId} for PR #${prNumber} (${branch}) has no failed job.`
			: `Run ${runId} for PR #${prNumber} (${branch}) failed: ${failedJobs.join(', ')}`
	);

	const plan = planRerun(failedJobs, allFailed);
	if (plan.action === 'refuse') {
		console.error(`Refusing: ${plan.reason}`);
		return false;
	}

	await run('gh', ['run', 'rerun', runId, '--failed']);
	if (plan.jobs.some((job) => job.includes(KNOWN_FLAKY_JOB))) {
		console.log(
			`${KNOWN_FLAKY_JOB} was among the reruns; log it on issue #125 per the flake tracker.`
		);
	}
	return true;
}

if (import.meta.main) {
	process.exitCode = (await rerunFailed(process.argv.slice(2))) ? 0 : 1;
}
