/**
 * What `POST /api/foods/resolve` accepts in one request.
 *
 * Both sides read this, which is the point: `resolve-endpoint.ts` refuses a body
 * that breaks the caps, and `catalog/food-resolve.ts` keeps within them so the
 * client can never build a request the server throws away whole. Mirroring the
 * numbers instead is how the length cap came to be enforced on one side only,
 * and a body refused for being too long is indistinguishable, to the caller,
 * from being offline.
 *
 * A module of its own, and one that imports nothing: the server's mutation lane
 * mutates everything its handlers can reach, so a rule shared with the browser
 * must not drag a dependency in behind it.
 */

/**
 * How many names one sentence may ask about. Each is a full-text search of 2.5
 * million rows, so the cap is what stops a single request buying an unbounded
 * number of them. Twelve is far more foods than a hand-typed sentence holds;
 * the client keeps whatever is past it as an unmatched row rather than dropping
 * it silently.
 */
export const MAX_QUERIES = 12;

/**
 * The longest a single name may be. A food name past eighty characters is not a
 * name, and the ranking has nothing to do with the tail of it — so the client
 * trims to this rather than being refused, and the server still refuses
 * anything longer.
 */
export const MAX_QUERY_LENGTH = 80;

/**
 * Whether a list of names is one this endpoint will answer.
 *
 * An empty list is not: nothing the client does produces one, so a body that
 * carries none was built by hand, and answering it would spend a round trip
 * saying nothing.
 */
export function withinLimits(queries: string[]): boolean {
	return (
		queries.length > 0 &&
		queries.length <= MAX_QUERIES &&
		queries.every((query) => query.length <= MAX_QUERY_LENGTH)
	);
}
