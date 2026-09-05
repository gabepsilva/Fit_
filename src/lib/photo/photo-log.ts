import { resolve } from '$app/paths';
import { catalogFoodToFood, isCatalogFoodPayload } from '$lib/domain/catalog-food';
import type { Food, Meal } from '$lib/domain/types';

/**
 * Sending a still to `/api/meals/photo` and reading what came back.
 *
 * The sibling of `catalog/barcode-lookup.ts` and `catalog/food-search.svelte.ts`,
 * and it reads the same way: one network answer becomes one of a handful of
 * outcomes, and every outcome that is not a plate has words of its own. A
 * photo nothing was recognised in and a photo that never reached the server
 * need different sentences — the first is worth retaking and the second is not.
 */

/** One food the photo held, already scaled onto its serving. */
export type PhotoFood = {
	/** What the model called it, kept for the row the catalog could not match. */
	label: string;
	/** The model's portion estimate. */
	grams: number;
	/** The catalog's first match, or `null` when it had none. */
	food: Food | null;
};

export type PhotoOutcome =
	/** The photo was read. `foods` is empty when it held nothing recognisable. */
	| { kind: 'ok'; foods: PhotoFood[] }
	/** Reading a photo needs a session this device does not have. */
	| { kind: 'unauthenticated' }
	/** No key, no catalog, or the model refused, timed out or failed. */
	| { kind: 'unavailable' }
	/** The day's allowance is spent. */
	| { kind: 'quota' }
	/** The request never got an answer at all. */
	| { kind: 'offline' };

const UNAVAILABLE = { kind: 'unavailable' } as const;

/**
 * One row of the answer, or `null`.
 *
 * A row whose `food` is present but unreadable is dropped rather than shown
 * without its nutrition: the person would be offered a food that logs nothing.
 * A row with no food at all is kept — that is the catalog saying so, and the
 * label is what tells the person what was skipped.
 */
function foodOf(value: unknown): PhotoFood | null {
	const row = (value ?? {}) as Record<string, unknown>;
	const label = row['label'];
	const grams = row['grams'];
	if (typeof label !== 'string' || typeof grams !== 'number') return null;
	const found = row['food'];
	if (found === null || found === undefined) return { label, grams, food: null };
	if (!isCatalogFoodPayload(found)) return null;
	return { label, grams, food: catalogFoodToFood(found) };
}

/** What the vision model made of this plate. */
export async function readPhoto(
	image: string,
	meal: Meal,
	doFetch: typeof fetch = fetch
): Promise<PhotoOutcome> {
	let response: Response;
	try {
		response = await doFetch(resolve('/api/meals/photo'), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ image, meal })
		});
	} catch {
		// A dropped connection is not an answer about this photo.
		return { kind: 'offline' };
	}
	if (response.status === 401) return { kind: 'unauthenticated' };
	if (response.status === 429) return { kind: 'quota' };
	// 503 is the server with no key, no catalog or no answer from the model, and
	// anything else unexpected reads the same: none of them is a plate.
	if (!response.ok) return UNAVAILABLE;

	// A body that is not JSON reads as `null`, the same as the JSON literal
	// `null`: neither carries items.
	const body = (await response.json().catch(() => null)) as { items?: unknown } | null;
	const rows = body === null ? null : body.items;
	if (!Array.isArray(rows)) return UNAVAILABLE;
	const foods: PhotoFood[] = [];
	for (const row of rows) {
		const food = foodOf(row);
		if (food !== null) foods.push(food);
	}
	return { kind: 'ok', foods };
}
