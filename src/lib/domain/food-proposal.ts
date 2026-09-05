import { nextProposalId, type Proposal } from './proposal-id';
import { resolveQuantity, type QuantitySpec } from './quantity';
import type { Food, Meal } from './types';

/**
 * One row on the Log sheet, built from a food and a quantity.
 *
 * Typing and photographing arrive at the same place: a quantity the device
 * read, and a catalog food the server named -- or no food at all. The quantity
 * is carried as the proposal's own `quantity` rather than converted away, so
 * the servings come out of the same `resolveQuantity` in both cases and are
 * computed again against the new food if the person matches the row to
 * something else.
 */

/** What the row says when the catalog had nothing for the text. */
export const NOT_FOUND_NOTE = 'Not found in the catalog';

/**
 * What the row says when the catalog row's serving weighs nothing, so the
 * quantity had nothing to divide by. Saying so is the difference between a
 * guess and a silent one.
 */
export const PORTION_UNKNOWN_NOTE = 'Portion unknown, set the servings';

export type FoodProposalInput = {
	/** The words the food was named by: the typed phrase, or the model's label. */
	query: string;
	/** What the catalog answered with, or `null` when it had nothing. */
	food: Food | null;
	quantity: QuantitySpec;
	meal: Meal;
	confidence: number;
	/**
	 * What to say when there is no food. Defaults to the catalog having nothing;
	 * a caller that could not reach the catalog at all says that instead, because
	 * "not in the catalog" would be a claim it has no grounds for.
	 */
	note?: string;
};

export function foodProposal({
	query,
	food,
	quantity,
	meal,
	confidence,
	note = NOT_FOUND_NOTE
}: FoodProposalInput): Proposal {
	const base = { id: nextProposalId(), query, meal, confidence, quantity };
	// Kept rather than dropped: the person sees what was skipped, with its own
	// words and its own quantity, and can match it to a food by hand.
	if (food === null) return { ...base, foodId: null, name: query, note, servings: 1 };
	const resolved = resolveQuantity(quantity, food);
	return {
		...base,
		foodId: food.id,
		name: food.name,
		servings: resolved.servings,
		...(resolved.declined ? { note: PORTION_UNKNOWN_NOTE } : {})
	};
}
