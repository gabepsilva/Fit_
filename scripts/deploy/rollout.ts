/**
 * What happens around `activate()` in `deploy.ts` when it throws: pruning
 * still has to run, and the operator still has to be told something more
 * useful than the crash `remote()` produces on its own.
 *
 * Split out from `deploy.ts` because neither half needs a machine to prove:
 * `activateAndPrune` is plain control flow, and `describeActivationFailure`
 * is a string transform. Both are exercised directly, without SSH.
 */

/** The shape `promisify(execFile)` rejects with — `capture()`'s failure mode. */
type ExecFailure = { stdout?: string; stderr?: string };

function isExecFailure(error: unknown): error is ExecFailure {
	return typeof error === 'object' && error !== null && ('stderr' in error || 'stdout' in error);
}

/**
 * The report an operator gets when activation rolls back.
 *
 * `remote()`'s rejection carries the machine's own account of what happened
 * on its `stderr` — `activationScript()` already writes "rolling back to
 * …", "rolled back: … -> …" or "did not answer either" there — but left
 * unhandled that rejection surfaces only as the stderr of a crash: a stack
 * trace whose message is `Command failed: ssh … | base64 -d | sudo bash`,
 * wrapping the base64-encoded script that produced it. This pulls the
 * machine's account out and states plainly what release failed and what was
 * attempted, without the base64 or the stack.
 */
export function describeActivationFailure(
	error: unknown,
	release: string,
	previous: string | null
): string {
	const lines = [
		`${release} did not go live.`,
		previous === null
			? 'No previous release existed on the machine, so nothing could be restored.'
			: `The machine attempted to roll back to the previous release: ${previous}`
	];
	const detail = isExecFailure(error) ? (error.stderr ?? '').trim() : '';
	lines.push(detail !== '' ? detail : error instanceof Error ? error.message : String(error));
	return lines.join('\n');
}

/**
 * Runs `activate`, and `prune` afterward regardless of whether activation
 * threw.
 *
 * Before this, `pruneReleases()` ran only after `activate()` returned, so a
 * release whose health check failed — the one case pruning matters most for —
 * was never pruned, and repeated failures accumulated under
 * `/opt/fit/releases/` without bound. `finally` is what makes pruning
 * unconditional; the error, if there was one, still propagates once it does.
 */
export async function activateAndPrune(
	activate: () => Promise<void>,
	prune: () => Promise<void>
): Promise<void> {
	try {
		await activate();
	} finally {
		await prune();
	}
}
