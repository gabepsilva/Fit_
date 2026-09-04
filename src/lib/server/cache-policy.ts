/**
 * How long a response this application produced may be reused without asking.
 *
 * `adapter-node` sends a rendered page with no `Cache-Control`, no `ETag` and no
 * `Last-Modified`. That is not "do not cache" — it is no freshness information
 * at all, and a cache handed nothing is free to invent a lifetime of its own.
 * Android's WebView invented a generous one on 2026-09-04 and spent the day
 * booting a build from that morning, asking for hashed chunks that every deploy
 * since had removed. `ssr = false` is what makes that fatal rather than merely
 * stale: the document is nothing but the bootstrap for one bundle, so an old
 * document names a bundle that is gone and the app does not start at all.
 *
 * So a response leaves here saying what it is. `no-cache` is the answer for a
 * document, and it is weaker than it sounds: the client may still store it and
 * the server may still answer the revalidation with a 304. What it forbids is
 * the one thing that broke — serving it again without asking.
 *
 * The hashed assets under `/_app/immutable/` are the deliberate opposite and
 * keep their year. They never reach this: `adapter-node` serves them from the
 * static middleware ahead of `handle`, which is why they carry a validator in
 * production and a page does not. A response that arrives here having already
 * declared a policy is left alone regardless — a route that called `setHeaders`
 * knew something about its own answer that this does not.
 */

/** Store it if you like; never serve it again without asking first. */
export const REVALIDATE = 'no-cache';

const POLICY = 'cache-control';

/** The response, now saying how long it may be reused. Mutated in place, as SvelteKit's hooks do. */
export function withCachePolicy(response: Response): Response {
	if (!response.headers.has(POLICY)) response.headers.set(POLICY, REVALIDATE);
	return response;
}
