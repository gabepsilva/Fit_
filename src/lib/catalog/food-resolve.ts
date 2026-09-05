import { resolve } from '$app/paths';
import { catalogFoodToFood, isCatalogFoodPayload } from '$lib/domain/catalog-food';
import { MAX_QUERY_LENGTH } from '$lib/domain/resolve-limits';
import type { Food } from '$lib/domain/types';

/**
 * Naming the foods a typed sentence held, from the browser.
 *
 * The sibling of `food-search.svelte.ts` and `barcode-lookup.ts`, and it reads
 * the same way: one network answer becomes one of a handful of outcomes, and
 * every outcome that is not a match has words of its own. A sentence that could
 * not be matched must not look like a sentence nothing was found for -- the
 * first is worth retrying and the second is not.
 */

/** What the catalog had for one of the names asked about. */
type ResolvedName = {
	query: string;
	/** The catalog's first match, or `null` when it had none. */
	food: Food | null;
};

export type ResolveOutcome =
	/** One row per name asked about, in the order they were asked. */
	| { kind: 'resolved'; items: ResolvedName[] }
	/** Matching needs a session this device does not have. */
	| { kind: 'signed-out' }
	/** No connection, no catalog on the server, or an answer that could not be read. */
	| { kind: 'unreachable' };

const UNREACHABLE = { kind: 'unreachable' } as const;

/**
 * One row of the answer, or `null` when it cannot be read.
 *
 * A row whose `food` is present but unreadable is not a row with no food: it is
 * a row this side does not understand, and taking it as "nothing matched" would
 * tell the person their food is not in the catalog when it is.
 */
function nameOf(value: unknown): ResolvedName | null {
	const row = (value ?? {}) as Record<string, unknown>;
	const query = row['query'];
	if (typeof query !== 'string') return null;
	const found = row['food'];
	if (found === null || found === undefined) return { query, food: null };
	if (!isCatalogFoodPayload(found)) return null;
	return { query, food: catalogFoodToFood(found) };
}

/**
 * The catalog's answer for every name in one typed sentence.
 *
 * One unreadable row makes the whole answer unreadable, and so does an answer
 * of the wrong length: the caller lines these up with its own chunks by
 * position, so a list that does not correspond would put one food's nutrition
 * against another food's quantity.
 */
export async function resolveFoodNames(
	queries: string[],
	doFetch: typeof fetch = fetch
): Promise<ResolveOutcome> {
	// Trimmed rather than sent whole. The endpoint refuses a body in which any
	// one name is too long, and a refusal is indistinguishable from being
	// offline, so a single long phrase would cost every other row in the
	// sentence its answer and be blamed on the connection. The tail of an
	// eighty-character phrase is not what the ranking reads anyway.
	const asked = queries.map((query) => query.slice(0, MAX_QUERY_LENGTH));
	let response: Response;
	try {
		response = await doFetch(resolve('/api/foods/resolve'), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ queries: asked })
		});
	} catch {
		// A dropped connection is not an answer about this sentence.
		return UNREACHABLE;
	}
	if (response.status === 401) return { kind: 'signed-out' };
	// 503 is the deployment with no catalog file; anything else unexpected reads
	// the same way, because none of them say these foods do not exist.
	if (!response.ok) return UNREACHABLE;

	// A body that is not JSON reads as `null`, the same as the JSON literal
	// `null`: neither carries rows.
	const body = (await response.json().catch(() => null)) as { items?: unknown } | null;
	const rows = body === null ? null : body.items;
	if (!Array.isArray(rows) || rows.length !== queries.length) return UNREACHABLE;
	const items: ResolvedName[] = [];
	for (const row of rows) {
		const item = nameOf(row);
		if (item === null) return UNREACHABLE;
		items.push(item);
	}
	return { kind: 'resolved', items };
}
