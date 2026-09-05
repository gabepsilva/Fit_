import { describe, expect, it } from 'vitest';
import { planRerun } from './rerun-failed';

describe('planning which failed jobs to rerun', () => {
	it('refuses when nothing failed', () => {
		expect(planRerun([], false)).toEqual({
			action: 'refuse',
			reason: 'no failed job on the latest run; nothing to rerun'
		});
	});

	it('reruns a single flaky shard without being asked twice', () => {
		expect(planRerun(['Safari'], false)).toEqual({ action: 'rerun', jobs: ['Safari'] });
	});

	it('refuses several failed jobs as a likely real break', () => {
		expect(planRerun(['Safari', 'lint'], false)).toEqual({
			action: 'refuse',
			reason:
				'2 jobs failed (Safari, lint); that looks like a real break rather than one flaky ' +
				'shard, so pass --all-failed to rerun them anyway'
		});
	});

	it('reruns several failed jobs when --all-failed says so', () => {
		expect(planRerun(['Safari', 'lint'], true)).toEqual({
			action: 'rerun',
			jobs: ['Safari', 'lint']
		});
	});
});
