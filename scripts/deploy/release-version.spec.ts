import { describe, expect, it } from 'vitest';
import { isTagged, releaseVersion, TAG_POLL_MS, TAG_WAIT_MS } from './release-version';

/**
 * The wait driven by an injected clock rather than a real one: the behavior
 * under test is "how long does it keep asking", and a spec that measured that
 * by sleeping would take two minutes to prove the timeout it is about.
 */

interface Harness {
	version: string;
	fetches: number;
	waits: number[];
	logs: string[];
	clock: number;
}

function harness(versions: string[]): {
	state: Harness;
	options: Parameters<typeof releaseVersion>[0];
} {
	const remaining = [...versions];
	const state: Harness = { version: '', fetches: 0, waits: [], logs: [], clock: 0 };
	return {
		state,
		options: {
			fetchTags: () => {
				state.fetches += 1;
				return Promise.resolve();
			},
			built: () => remaining.shift() ?? (versions.at(-1) as string),
			now: () => state.clock,
			wait: (milliseconds) => {
				state.waits.push(milliseconds);
				state.clock += milliseconds;
				return Promise.resolve();
			},
			log: (message) => state.logs.push(message)
		}
	};
}

describe('whether a version names a release', () => {
	it('says a bare tag is one', () => {
		expect(isTagged('v0.0.7')).toBe(true);
	});

	it('says a build ahead of its tag is not', () => {
		expect(isTagged('v0.0.7+be031ca')).toBe(false);
	});
});

describe('the version a deploy releases', () => {
	it('fetches tags before it looks, because the checkout may never have had them', async () => {
		const { state, options } = harness(['v0.0.7']);
		expect(await releaseVersion(options)).toBe('v0.0.7');
		expect(state.fetches).toBe(1);
		expect(state.waits).toEqual([]);
	});

	it('waits for the tag the merge that just landed is about to get', async () => {
		const { state, options } = harness(['v0.0.6+be031ca', 'v0.0.6+be031ca', 'v0.0.7']);
		expect(await releaseVersion(options)).toBe('v0.0.7');
		expect(state.fetches).toBe(3);
		expect(state.waits).toEqual([TAG_POLL_MS, TAG_POLL_MS]);
		expect(state.logs).toEqual([]);
	});

	it('gives up after two minutes and releases the commit form, saying so', async () => {
		const { state, options } = harness(['v0.0.6+be031ca']);
		expect(await releaseVersion(options)).toBe('v0.0.6+be031ca');
		expect(state.clock).toBe(TAG_WAIT_MS);
		expect(state.logs).toEqual(['No v* tag on HEAD after 120s; releasing v0.0.6+be031ca instead.']);
	});

	it('honours a shorter deadline rather than the default one', async () => {
		const { state, options } = harness(['v0.0.6+be031ca']);
		expect(await releaseVersion({ ...options, timeoutMs: 10, pollMs: 5 })).toBe('v0.0.6+be031ca');
		expect(state.waits).toEqual([5, 5]);
		expect(state.logs).toEqual(['No v* tag on HEAD after 0s; releasing v0.0.6+be031ca instead.']);
	});
});
