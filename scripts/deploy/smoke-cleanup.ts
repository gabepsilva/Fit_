/**
 * The guarantee that the throwaway account the smoke check registers is asked
 * for again, whatever the rest of the run decided.
 *
 * It was written last in a straight line of checks: register, sign out, sign
 * in, read the session back, assert the live release, then remove the row. Any
 * check that threw — a release whose symlink had not moved, a request that
 * timed out, a sign-in that came back 500 — jumped over the removal, and the
 * account it had already created stayed in the production `account` table. Two
 * of them were found there hours and several deploys later, which is exactly
 * the unbounded growth `smoke-account.ts` exists to prevent.
 *
 * `scripts/github/as-owen.ts` revokes its token in a `finally` for the same
 * reason: the cleanup is not a step of the happy path, it is what the happy
 * path is wrapped in.
 *
 * The two outcomes are kept apart rather than merged. A cleanup that also
 * failed must not replace the failure that made the deploy fail — an operator
 * reading "could not remove smoke.17884…" would have to guess what actually
 * went wrong, and would still have the row to prune.
 */

export type SmokeOutcome = {
	/** What the checks failed with, or `undefined` when they all passed. */
	failure: string | undefined;
	/** Account rows the machine deleted; `-1` when it answered with something else. */
	removed: number;
	/** Why the removal could not be attempted at all, if it could not. */
	removalFailure: string | undefined;
};

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Runs `body`, then `remove` regardless of whether it threw, and reports both.
 *
 * Neither failure is rethrown: the caller decides which one the deploy is
 * told about, and it cannot decide that if one of them has already unwound
 * the stack. A `finally` block that threw would do the opposite — replace the
 * checks' failure with the cleanup's.
 */
export async function runAndRemove(
	body: () => Promise<void>,
	remove: () => Promise<number>
): Promise<SmokeOutcome> {
	let failure: string | undefined;
	try {
		await body();
	} catch (error) {
		failure = messageOf(error);
	}
	try {
		return { failure, removed: await remove(), removalFailure: undefined };
	} catch (error) {
		return { failure, removed: -1, removalFailure: messageOf(error) };
	}
}

/**
 * What became of the row, in a clause an operator reads beside the failure
 * that caused it.
 *
 * Zero is worth saying out loud: it means the run failed before registration,
 * so there is nothing to prune — which is the difference between a deploy to
 * investigate and a deploy to investigate plus a table to clean.
 */
export function describeRemoval(username: string, outcome: SmokeOutcome): string {
	if (outcome.removalFailure !== undefined) {
		return `${username} could not be removed: ${outcome.removalFailure}`;
	}
	if (outcome.removed === 1) return `${username} was removed anyway`;
	if (outcome.removed === 0) return `no ${username} row was left behind`;
	return `removing ${username} answered with something other than a row count`;
}
