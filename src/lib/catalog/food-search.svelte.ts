import { resolve } from '$app/paths';
import { catalogFoodToFood, isCatalogFoodPayload } from '$lib/domain/catalog-food';
import type { Food } from '$lib/domain/types';

/**
 * Searching the 2.5-million-row catalog from the browser.
 *
 * `barcode-lookup.ts` is the sibling of this file and the two read the same
 * way: a network answer becomes one of a handful of outcomes, and every outcome
 * that is not a match has words of its own. A search that fails must not look
 * like a search that found nothing — the first is worth retrying and the second
 * is not.
 */

/**
 * Search begins at the third character, because that is where the server begins
 * it: `query.ts` drops shorter tokens, since "ch" matches 128,310 rows in 376 ms
 * and ranks nothing useful. Asking anyway would spend a request to be told the
 * same thing.
 */
export const MIN_QUERY_LENGTH = 3;

/**
 * How long the typing has to pause before a request goes out.
 *
 * Against a local array every keystroke was free; against the network at ~217 ms
 * warm it is not. 250 ms is about one keystroke of a fast typist, so "chicken"
 * costs one request rather than seven, and the wait it adds is under the round
 * trip it saves.
 */
export const DEBOUNCE_MS = 250;

/** What the catalog had to say about what was typed. */
export type SearchOutcome =
	/** Ranked matches, already scaled onto their servings. */
	| { kind: 'matched'; foods: Food[] }
	/** The catalog was read and holds nothing for this. */
	| { kind: 'none' }
	/** The catalog needs a session this device does not have. */
	| { kind: 'signed-out' }
	/** No connection, no catalog on the server, or an answer that could not be read. */
	| { kind: 'unreachable' };

/** The catalog's ranked matches for what a person typed. */
export async function searchCatalogFoods(
	query: string,
	doFetch: typeof fetch = fetch
): Promise<SearchOutcome> {
	let response: Response;
	try {
		response = await doFetch(`${resolve('/api/foods')}?q=${encodeURIComponent(query)}`);
	} catch {
		// A dropped connection is not an answer about this query.
		return { kind: 'unreachable' };
	}
	if (response.status === 401) return { kind: 'signed-out' };
	// 503 is the deployment with no catalog file; anything else unexpected reads
	// the same way, because none of them say this food does not exist.
	if (!response.ok) return { kind: 'unreachable' };

	// A body that is not JSON reads as `null`, the same as the JSON literal
	// `null`: neither carries rows, and neither is an answer about this query.
	const body = (await response.json().catch(() => null)) as { foods?: unknown } | null;
	const rows = body === null ? null : body.foods;
	if (!Array.isArray(rows)) return { kind: 'unreachable' };
	// One unreadable row makes the whole answer unreadable: dropping it silently
	// would show a shorter list than the catalog ranked and say nothing about it.
	if (!rows.every(isCatalogFoodPayload)) return { kind: 'unreachable' };
	if (rows.length === 0) return { kind: 'none' };
	return { kind: 'matched', foods: rows.map(catalogFoodToFood) };
}

/**
 * One search box's conversation with the catalog: debounced, and latest-wins.
 *
 * The race is the reason this is a module and not three lines in the component.
 * A broad query scores far more rows than the narrower one typed after it, so
 * the first request can land second — and without a guard it would replace the
 * results for text the person is no longer looking at. Every request carries a
 * sequence number and only the newest one may write, which also means a query
 * that drops below `MIN_QUERY_LENGTH` retires whatever is in flight rather than
 * letting its answer arrive into an empty box.
 */
export function createFoodSearch(doFetch: typeof fetch = fetch) {
	let outcome = $state.raw<SearchOutcome | null>(null);
	let searching = $state(false);
	let issued = 0;
	// Undefined rather than null, so `stop` can clear unconditionally: a guard
	// here would be a branch no test could observe, since clearing a timer that
	// was never set is already a no-op.
	let timer: ReturnType<typeof setTimeout> | undefined;

	/** Undo a pending request, for when the search box is taken away. */
	function stop() {
		clearTimeout(timer);
		timer = undefined;
	}

	async function run(query: string) {
		const seq = ++issued;
		const answer = await searchCatalogFoods(query, doFetch);
		// Something newer was asked while this was in flight; that answer is the
		// one the person is waiting for.
		if (seq !== issued) return;
		outcome = answer;
		searching = false;
	}

	return {
		/** The catalog's last word on the current query, or `null` when it has none. */
		get outcome() {
			return outcome;
		},
		/** Whether an answer for what is in the box is still coming. */
		get searching() {
			return searching;
		},
		/** Take what has been typed. Nothing goes out until the typing pauses. */
		ask(query: string) {
			stop();
			// Retires anything already in flight, so its answer cannot land after this.
			issued += 1;
			const trimmed = query.trim();
			if (trimmed.length < MIN_QUERY_LENGTH) {
				outcome = null;
				searching = false;
				return;
			}
			searching = true;
			timer = setTimeout(() => void run(trimmed), DEBOUNCE_MS);
		},
		stop
	};
}
