import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { capture } from '../security/shared';

const execFileAsync = promisify(execFile);

/**
 * Refuses to ship a commit whose own CI run on `main` is not green.
 *
 * The incident this exists for: PR #120 and PR #121 were each green on their
 * own branch, based on the same commit, and merged back to back. Main's CI
 * for the merged result then failed `check:bundle` by 8 bytes (run
 * 33941127559) — a state neither PR's green run ever tested — and that
 * failing commit was deployed anyway as v0.0.10, because nothing asked main.
 * A PR's checks answer for its branch; only the run keyed to the exact commit
 * on `main` answers for what is about to ship.
 *
 * The wait reuses `release-version.ts`'s ceiling: about two minutes is long
 * enough for a run already `in_progress` to finish, short enough not to turn
 * a broken check into an indefinite hang.
 */

/** Same ceiling as `TAG_WAIT_MS` in `release-version.ts`, for the same reason. */
export const CI_WAIT_MS = 120_000;

/** Same cadence as `TAG_POLL_MS` in `release-version.ts`. */
export const CI_POLL_MS = 5_000;

/** The environment variable that bypasses this check, for the day it is itself broken. */
export const ALLOW_RED_MAIN_VARIABLE = 'FIT_DEPLOY_ALLOW_RED_MAIN';

/** The one workflow this check looks for a run of. */
const CI_WORKFLOW = 'ci.yml';

/** The branch a deploy's commit must have a green run on. */
const CI_BRANCH = 'main';

export interface CiRun {
	status: string;
	conclusion: string | null;
	url: string;
}

export interface MainCiGateOptions {
	/** The runs GitHub reports for this commit, this workflow, this branch — newest first. */
	fetchRuns: () => Promise<CiRun[]>;
	/** Milliseconds since some fixed point; injected so a spec need not sleep. */
	now: () => number;
	wait: (milliseconds: number) => Promise<void>;
	log: (message: string) => void;
	/** `FIT_DEPLOY_ALLOW_RED_MAIN=1` was set: proceed regardless, loudly. */
	allowRedMain?: boolean;
	timeoutMs?: number;
	pollMs?: number;
}

/**
 * Resolves when it is safe to deploy, rejects with the reason otherwise.
 *
 * No run yet is refused outright rather than waited on: a deploy that runs
 * moments after a merge and finds nothing has arrived too early to be sure
 * CI was even triggered, and waiting on a run that may never exist is the
 * same failure mode this check is meant to prevent. A run already under way
 * is worth waiting on, up to the ceiling, because it is expected to finish.
 */
export async function mainCiGate(options: MainCiGateOptions): Promise<void> {
	if (options.allowRedMain === true) {
		options.log(
			`${ALLOW_RED_MAIN_VARIABLE}=1: skipping the check that main's CI is green for this ` +
				'commit. This can ship a release nothing has verified.'
		);
		return;
	}

	const timeout = options.timeoutMs ?? CI_WAIT_MS;
	const poll = options.pollMs ?? CI_POLL_MS;
	const deadline = options.now() + timeout;

	for (;;) {
		const runs = await options.fetchRuns();
		const run = runs[0];
		if (run === undefined) {
			throw new Error(
				`No ${CI_WORKFLOW} run found on ${CI_BRANCH} for this commit; refusing to deploy it.`
			);
		}
		if (run.status === 'completed') {
			if (run.conclusion === 'success') return;
			throw new Error(
				`CI on ${CI_BRANCH} for this commit concluded "${run.conclusion}", not success: ${run.url}`
			);
		}
		if (options.now() >= deadline) {
			throw new Error(
				`CI on ${CI_BRANCH} for this commit is still "${run.status}" after ` +
					`${Math.round(timeout / 1000)}s; refusing to deploy it: ${run.url}`
			);
		}
		await options.wait(poll);
	}
}

async function assertGhAvailable(): Promise<void> {
	try {
		await execFileAsync('gh', ['--version']);
	} catch {
		throw new Error(
			'the deploy CI check needs the gh CLI on PATH; install it rather than skip the check'
		);
	}
}

async function fetchMainCiRuns(commit: string): Promise<CiRun[]> {
	const output = await capture('gh', [
		'run',
		'list',
		'--workflow',
		CI_WORKFLOW,
		'--commit',
		commit,
		'--branch',
		CI_BRANCH,
		'--json',
		'status,conclusion,url'
	]);
	return JSON.parse(output === '' ? '[]' : output) as CiRun[];
}

/** The same thing, wired to `gh` and the clock. */
export async function assertMainCiGreen(commit: string): Promise<void> {
	const allowRedMain = process.env[ALLOW_RED_MAIN_VARIABLE] === '1';
	if (!allowRedMain) await assertGhAvailable();
	await mainCiGate({
		fetchRuns: () => fetchMainCiRuns(commit),
		now: () => Date.now(),
		wait: (milliseconds) => delay(milliseconds),
		log: (message) => console.log(message),
		allowRedMain
	});
}
