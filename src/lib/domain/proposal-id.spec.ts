import { beforeEach, describe, expect, it } from 'vitest';
import { nextProposalId, resetProposalIds } from './proposal-id';

beforeEach(() => {
	resetProposalIds();
});

describe('nextProposalId', () => {
	it('starts at proposal-0', () => {
		expect(nextProposalId()).toBe('proposal-0');
	});

	it('increases by one each call', () => {
		expect(nextProposalId()).toBe('proposal-0');
		expect(nextProposalId()).toBe('proposal-1');
		expect(nextProposalId()).toBe('proposal-2');
	});

	it('never repeats an id across many calls', () => {
		const ids = new Set(Array.from({ length: 50 }, () => nextProposalId()));
		expect(ids.size).toBe(50);
	});
});

describe('resetProposalIds', () => {
	it('brings the counter back to proposal-0', () => {
		nextProposalId();
		nextProposalId();
		resetProposalIds();
		expect(nextProposalId()).toBe('proposal-0');
	});
});
