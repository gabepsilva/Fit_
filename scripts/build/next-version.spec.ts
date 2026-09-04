import { describe, expect, it } from 'vitest';
import { lines, MINOR_LABEL, nextVersion } from './next-version';

/**
 * The bump decided here rather than in the workflow that pushes it: until the
 * first tag exists there is nothing to try it against, so the first merge to
 * run the arithmetic would also have been the first merge to get it wrong.
 */

const NO_LABELS: string[] = [];

describe('the tag a merge to main gets', () => {
	it('is v0.0.1 on the first run, when the repository has no tags at all', () => {
		expect(nextVersion({ tags: [], headTags: [], labels: NO_LABELS })).toBe('v0.0.1');
	});

	it('bumps the patch when the pull request carried no release label', () => {
		expect(nextVersion({ tags: ['v0.0.7'], headTags: [], labels: ['story'] })).toBe('v0.0.8');
	});

	it('bumps the minor and resets the patch for a release:minor pull request', () => {
		expect(nextVersion({ tags: ['v0.3.7'], headTags: [], labels: ['story', MINOR_LABEL] })).toBe(
			'v0.4.0'
		);
	});

	it('opens the minor series at v0.1.0 when nothing has been released yet', () => {
		expect(nextVersion({ tags: [], headTags: [], labels: [MINOR_LABEL] })).toBe('v0.1.0');
	});

	it('counts v0.0.10 as newer than v0.0.9, which string order does not', () => {
		// The defect this whole module exists to make testable: sorted as text,
		// `v0.0.10` comes before `v0.0.9`, and the eleventh merge would reissue
		// a tag the tenth already used.
		expect(nextVersion({ tags: ['v0.0.9', 'v0.0.10'], headTags: [], labels: NO_LABELS })).toBe(
			'v0.0.11'
		);
	});

	it('reads the newest tag whatever order they arrive in', () => {
		expect(
			nextVersion({ tags: ['v0.1.0', 'v1.2.3', 'v0.9.9'], headTags: [], labels: NO_LABELS })
		).toBe('v1.2.4');
	});

	it('keeps the major it found, because a major is only ever moved by hand', () => {
		expect(nextVersion({ tags: ['v1.4.2'], headTags: [], labels: [MINOR_LABEL] })).toBe('v1.5.0');
	});

	it('answers with nothing when the commit already carries a tag, so a re-run adds none', () => {
		expect(nextVersion({ tags: ['v0.0.7'], headTags: ['v0.0.7'], labels: NO_LABELS })).toBeNull();
	});

	it('is not stopped by a tag on HEAD that is not a version', () => {
		expect(nextVersion({ tags: ['v0.0.7'], headTags: ['nightly'], labels: NO_LABELS })).toBe(
			'v0.0.8'
		);
	});

	it('ignores tags that are not versions rather than counting them as releases', () => {
		expect(
			nextVersion({
				tags: ['v0.0.7', 'v2', 'release-9', 'v1.0.0-rc.1'],
				headTags: [],
				labels: NO_LABELS
			})
		).toBe('v0.0.8');
	});

	it('takes the minor label only when it is exactly that label', () => {
		expect(
			nextVersion({
				tags: ['v0.0.7'],
				headTags: [],
				labels: ['prerelease:minor', 'release:minor?']
			})
		).toBe('v0.0.8');
	});
});

describe('the lists the workflow hands over', () => {
	it('are one value per line, as git and gh both print them', () => {
		expect(lines('v0.0.7\nv0.0.8\n')).toEqual(['v0.0.7', 'v0.0.8']);
	});

	it('are empty when the workflow had nothing to pass', () => {
		expect(lines(undefined)).toEqual([]);
		expect(lines('')).toEqual([]);
	});

	it('drop the blank lines a command that printed nothing leaves behind', () => {
		expect(lines('\n  \nstory\n')).toEqual(['story']);
	});
});
