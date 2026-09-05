import { describe, expect, it } from 'vitest';
import { ALLOW_RED_MAIN_VARIABLE, CI_POLL_MS, CI_WAIT_MS, mainCiGate } from './main-ci-gate';
import type { CiRun, MainCiGateOptions } from './main-ci-gate';

/**
 * The wait driven by an injected clock rather than a real one, matching
 * `release-version.spec.ts`: the behavior under test is "how long does it
 * keep asking", not how long the test itself takes.
 */

interface Harness {
	waits: number[];
	logs: string[];
	clock: number;
}

function harness(runs: CiRun[][]): { state: Harness; options: MainCiGateOptions } {
	const remaining = [...runs];
	const state: Harness = { waits: [], logs: [], clock: 0 };
	return {
		state,
		options: {
			fetchRuns: () => Promise.resolve(remaining.shift() ?? (runs.at(-1) as CiRun[])),
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

const SUCCESS: CiRun = { status: 'completed', conclusion: 'success', url: 'https://ci/1' };
const FAILURE: CiRun = { status: 'completed', conclusion: 'failure', url: 'https://ci/2' };
const IN_PROGRESS: CiRun = { status: 'in_progress', conclusion: null, url: 'https://ci/3' };

describe('the gate on deploying a commit whose CI on main might not be green', () => {
	it('proceeds when the run for this commit succeeded', async () => {
		const { state, options } = harness([[SUCCESS]]);
		await expect(mainCiGate(options)).resolves.toBeUndefined();
		expect(state.waits).toEqual([]);
	});

	it('refuses with the run URL when the run for this commit failed', async () => {
		const { options } = harness([[FAILURE]]);
		await expect(mainCiGate(options)).rejects.toThrow(/concluded "failure".*https:\/\/ci\/2/);
	});

	it('refuses when no run exists for this commit, without waiting', async () => {
		const { state, options } = harness([[]]);
		await expect(mainCiGate(options)).rejects.toThrow(/No ci\.yml run found/);
		expect(state.waits).toEqual([]);
	});

	it('waits while the run is in progress, then proceeds once it succeeds', async () => {
		const { state, options } = harness([[IN_PROGRESS], [IN_PROGRESS], [SUCCESS]]);
		await expect(mainCiGate(options)).resolves.toBeUndefined();
		expect(state.waits).toEqual([CI_POLL_MS, CI_POLL_MS]);
	});

	it('gives up after the ceiling and refuses, naming the run URL', async () => {
		const { state, options } = harness([[IN_PROGRESS]]);
		await expect(mainCiGate(options)).rejects.toThrow(
			/still "in_progress" after 120s.*https:\/\/ci\/3/
		);
		expect(state.clock).toBe(CI_WAIT_MS);
	});

	it('honours a shorter deadline than the default', async () => {
		const { state, options } = harness([[IN_PROGRESS]]);
		await expect(mainCiGate({ ...options, timeoutMs: 10, pollMs: 5 })).rejects.toThrow(
			/still "in_progress" after 0s/
		);
		expect(state.waits).toEqual([5, 5]);
	});

	it('proceeds with a loud warning when the escape hatch is set, without fetching', async () => {
		const { state, options } = harness([[FAILURE]]);
		let fetched = false;
		await expect(
			mainCiGate({
				...options,
				allowRedMain: true,
				fetchRuns: () => {
					fetched = true;
					return options.fetchRuns();
				}
			})
		).resolves.toBeUndefined();
		expect(fetched).toBe(false);
		expect(state.logs).toEqual([
			`${ALLOW_RED_MAIN_VARIABLE}=1: skipping the check that main's CI is green for this ` +
				'commit. This can ship a release nothing has verified.'
		]);
	});
});
