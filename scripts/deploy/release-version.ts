import { setTimeout as delay } from 'node:timers/promises';
import { readBuildVersion } from '../build/app-version';
import { run } from '../security/shared';

/**
 * The version a release is about to be built with, once the tag for it exists.
 *
 * A deploy usually follows a merge by seconds, and the tag for that merge is
 * put on by `.github/workflows/version-tag.yml` a moment later. The deploy also
 * runs from a checkout that fetched no tags, so `git describe` would answer
 * from whatever was last pulled. Both failures look the same from here — an
 * untagged `HEAD` — and both are fixed by fetching and, briefly, waiting.
 *
 * Waiting is bounded and never fatal: after the deadline the release goes out
 * with the `+<short sha>` form, which is a true statement about what was built
 * rather than a guess at the tag that has not arrived. The log says which of
 * the two happened, so nobody has to infer it from the version string.
 */

/** How long a merge's tag is given to arrive before the release goes out without it. */
export const TAG_WAIT_MS = 120_000;

/** Long enough not to hammer the remote, short enough to cost seconds and not minutes. */
export const TAG_POLL_MS = 5_000;

/** A version with no `+<sha>` suffix is one that sits exactly on its tag. */
export function isTagged(version: string): boolean {
	return !version.includes('+');
}

export interface ReleaseVersionOptions {
	/** Bring the remote's tags into this checkout. */
	fetchTags: () => Promise<void>;
	/** What this checkout would build right now. */
	built: () => string;
	/** Milliseconds since some fixed point; injected so a spec need not sleep. */
	now: () => number;
	wait: (milliseconds: number) => Promise<void>;
	log: (message: string) => void;
	timeoutMs?: number;
	pollMs?: number;
}

export async function releaseVersion(options: ReleaseVersionOptions): Promise<string> {
	const timeout = options.timeoutMs ?? TAG_WAIT_MS;
	const poll = options.pollMs ?? TAG_POLL_MS;
	const deadline = options.now() + timeout;
	for (;;) {
		await options.fetchTags();
		const version = options.built();
		if (isTagged(version)) return version;
		if (options.now() >= deadline) {
			options.log(
				`No v* tag on HEAD after ${Math.round(timeout / 1000)}s; releasing ${version} instead.`
			);
			return version;
		}
		await options.wait(poll);
	}
}

/** The same thing, wired to git and the clock. */
export async function currentReleaseVersion(): Promise<string> {
	return releaseVersion({
		fetchTags: async () => {
			await run('git', ['fetch', '--tags', '--force'], { allowFailure: true });
		},
		built: () => readBuildVersion().version,
		now: () => Date.now(),
		wait: (milliseconds) => delay(milliseconds),
		log: (message) => console.log(message)
	});
}
