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
 * A path this app may navigate to, as far as the type system is concerned.
 *
 * `ResolvedPathname` is generated from the route tree, and neither value below
 * can be checked against it: one is a query string appended to a resolved
 * route, and the other arrives in a URL a person can type. The assertion is
 * where that gap is admitted, and it is confined to this file so there is one
 * place to read about it.
 *
 * What makes it safe is not the type but `returnPath`, which is the validator:
 * everything it returns is a path on this origin. An address that names no
 * route reaches the app's own not-found page, which is what typing one into the
 * bar does anyway.
 */
function asPathname(path: string): ResolvedPathname {
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
	return asPathname(`${resolve('/signin')}${query}`);
}

/**
 * A second slash after the first, in either of the two spellings a URL has.
 *
 * `//host` is the obvious one. `/\host` is the same thing: the URL parser
 * treats a backslash as a slash for `http` and `https`, so
 * `new URL('/\\evil.example', 'http://app.local')` is `http://evil.example`
 * exactly as the double slash is. Checking only the visible spelling left the
 * other one certified as a path on this origin.
 */
const ABSOLUTE_ELSEWHERE = /^\/[/\\]/;

/**
 * Where to go back to after signing in, taken from the query string.
 *
 * The value arrives in a URL, which anybody can write, so it is a destination
 * only if it is a path on this origin: it must start with a slash, and that
 * slash must not be followed by another. `//host`, `/\host` and
 * `https://host` are what that rejects — all three are absolute elsewhere, and
 * following one would turn the sign-in page into an open redirect.
 *
 * An auth route is refused too, so a stale `?next=/signin` cannot bounce
 * someone back to the form they just cleared. Both a query and a fragment are
 * cut before that comparison: `/signin#x` is the sign-in page as surely as
 * `/signin?x=1` is, and it is the worse one to miss — arriving there is a
 * navigation within the same route, so the page is not remounted and the check
 * that would have moved a signed-in visitor on never runs again.
 */
export function returnPath(next: string | null): ResolvedPathname {
	if (next === null || !next.startsWith('/') || ABSOLUTE_ELSEWHERE.test(next))
		return asPathname('/');
	const path = next.split(/[?#]/)[0];
	return AUTH_ROUTES.some((route) => route === path) ? asPathname('/') : asPathname(next);
}
