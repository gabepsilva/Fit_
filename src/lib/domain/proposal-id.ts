import type { QuantifiedItem } from './quantity';

/**
 * A proposal keyed by a stable id rather than its position in the list.
 * `LogSheet` keys its `{#each}` by `id` and tracks the open match panel by
 * `id`, so removing or reordering one proposal never moves another's
 * identity — open match panel, in-progress edits — onto the wrong item.
 */
export type Proposal = QuantifiedItem & { id: string };

let counter = 0;

/**
 * A monotonically increasing id, unique for the life of the module. A
 * counter rather than `crypto.randomUUID()` because it makes proposal
 * order deterministic to assert on in tests.
 */
export function nextProposalId(): string {
	return `proposal-${counter++}`;
}

/** Test-only: resets the counter so ids are predictable across specs that share this module. */
export function resetProposalIds(): void {
	counter = 0;
}
