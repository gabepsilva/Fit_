import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';

/** The two destinations an unauthenticated visitor is allowed to reach. */
export type AuthRoute = '/signin' | '/signup';

/**
 * Where the gate sends someone who is not signed in, and where it must not
 * send them from: a redirect off the sign-in page would be a loop.
 *
 * Kept beside the gate rather than inside it because three places need the same
 * list — the shell decides whether to gate, the sign-in page decides where to
 * return to, and both are tested against it.
 */
export const AUTH_ROUTES: readonly AuthRoute[] = ['/signin', '/signup'];

/**
 * The one place a string becomes something this app will navigate to.
 *
 * `ResolvedPathname` is generated from the route tree, so it can only describe
 * an address known at compile time. Neither value here is: one is a query
 * appended to a resolved route, and the other is read out of a URL. The
 * assertion is where that is admitted, and it is a single private function so
 * that admitting it twice is impossible.
 *
 * What it rests on is `returnPath` below, which does not inspect the string but
 * parses it — against the same `URL` the browser will build from it. A value
 * that survives that parse is on this origin because the parser says so, which
 * is a stronger claim than any list of prefixes I could remember to reject.
 */
function navigable(path: string): ResolvedPathname {
	return path as ResolvedPathname;
}

/**
 * The sign-in form, told where the visitor was going.
 *
 * The home page is the default on the other side, so it is not worth spelling
 * out — and leaving it off keeps the address bar clean for the common case.
 */
export function signInPath(from: string): ResolvedPathname {
	const query = from === '/' ? '' : `?next=${encodeURIComponent(from)}`;
	return navigable(`${resolve('/signin')}${query}`);
}

/**
 * Where to go back to after signing in, read from the query string.
 *
 * The value arrives in a URL, so it is written by whoever wrote the link, and
 * the question is not "does it look like a path" but "where would the browser
 * actually go". Those differ, which is the whole difficulty: `//host` is an
 * absolute URL, and so is `/\host`, because the parser treats a backslash as a
 * slash for `http` and `https`. A hand-written list of prefixes is only ever as
 * good as the spellings its author thought of.
 *
 * So this parses rather than inspects. `new URL(next, origin)` is the same
 * construction the browser performs, and comparing the result's origin to this
 * one settles every spelling at once — the two above, an absolute `https://`
 * URL, and a `javascript:` scheme, which parses to an origin that is not this
 * one. What comes back is rebuilt from the parsed parts, so it is also
 * normalized: `/a/../b` returns as `/b` rather than as something a later
 * comparison has to know how to fold.
 *
 * A leading slash is still required. The parser would happily read `exercise`
 * as a relative path and resolve it to `/exercise`, but a `next` that does not
 * say where it starts is a malformed link rather than a destination, and
 * guessing at one is how an unintended address gets followed.
 *
 * An auth route is refused last, so a stale `?next=/signin` cannot bounce
 * someone back to the form they just cleared. That comparison uses `pathname`,
 * which the parse has already separated from any query or fragment: `/signin#x`
 * is the sign-in page, and it is the worse one to miss, because arriving there
 * is a navigation within the route already on screen — the page is not
 * remounted, so the check that would move a signed-in visitor on never runs.
 */
export function returnPath(next: string | null, origin: string): ResolvedPathname {
	const home = resolve('/');
	if (next === null || !next.startsWith('/')) return home;

	let destination: URL;
	try {
		destination = new URL(next, origin);
	} catch {
		// An origin this malformed is not something a caller can act on, and a
		// refused `next` is the same answer as an absent one.
		return home;
	}

	if (destination.origin !== origin) return home;
	if (AUTH_ROUTES.some((route) => resolve(route) === destination.pathname)) return home;
	return navigable(`${destination.pathname}${destination.search}${destination.hash}`);
}
