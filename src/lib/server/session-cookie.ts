import type { Cookies } from '@sveltejs/kit';

/**
 * The one place the session cookie is written, and the one place it is removed.
 *
 * Every attribute here is load-bearing, and a cookie set with a different set
 * of them somewhere else would be a second, weaker cookie of the same name that
 * the browser cannot tell apart. Sign-in, sign-out and session rotation all go
 * through these two functions for that reason.
 *
 * The Android build never sees any of this: it holds the same token and sends
 * it as `Authorization: Bearer`, which is why `request-auth.ts` gives an
 * explicit header precedence over an ambient cookie.
 */

/** The cookie the web build carries its session token in. */
export const SESSION_COOKIE = 'fit_session';

/** What `createSession` hands back, as far as the cookie is concerned. */
export type IssuedSession = { token: string; expiresAt: string };

/** The part of SvelteKit's `Cookies` this module uses, so a test can stand in for it. */
export type SessionCookieWriter = Pick<Cookies, 'set' | 'delete'>;

/** Scoped to the whole site: every route is behind the same session. */
const COOKIE_PATH = '/';

/**
 * `Lax`, not `Strict`.
 *
 * `Strict` withholds the cookie on a top-level navigation from anywhere else,
 * so following a link to a plan or opening a bookmark from a message would land
 * signed out and look like a lost session. `Lax` still withholds it from every
 * cross-site POST, and the state-changing requests it does not cover are the
 * ones the origin policy is there to refuse — the pairing that makes `Lax`
 * safe rather than merely convenient.
 */
const SAME_SITE = 'lax' as const;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * `Secure` everywhere except loopback HTTP.
 *
 * `vite dev` serves plain HTTP on localhost, where a `Secure` cookie is dropped
 * and nobody could sign in. Every other host gets `Secure` whatever its scheme,
 * so an accidental plain-HTTP deployment fails visibly at sign-in instead of
 * quietly handing session tokens to the network.
 */
function isSecureContext(url: URL): boolean {
	return url.protocol === 'https:' || !LOOPBACK_HOSTS.has(url.hostname);
}

function cookieAttributes(url: URL, maxAge: number) {
	return {
		path: COOKIE_PATH,
		// No route may read the token from script: an XSS then cannot exfiltrate
		// the session, only ride it while the page is open.
		httpOnly: true,
		secure: isSecureContext(url),
		sameSite: SAME_SITE,
		maxAge
	};
}

/**
 * Write the session cookie so it dies with the row behind it.
 *
 * `maxAge` is derived from the session's own expiry rather than being a second
 * lifetime that could outlast it, which would leave the browser sending a token
 * the server deleted months ago.
 */
export function setSessionCookie(
	cookies: SessionCookieWriter,
	url: URL,
	issued: IssuedSession,
	now = new Date()
): void {
	const remainingMs = new Date(issued.expiresAt).getTime() - now.getTime();
	const maxAge = Math.max(0, Math.floor(remainingMs / 1000));
	cookies.set(SESSION_COOKIE, issued.token, cookieAttributes(url, maxAge));
}

/**
 * Remove the session cookie.
 *
 * The attributes have to match the ones it was written with: a browser matches
 * a removal on name, path and domain, so a `path` that differs leaves the
 * original cookie in place and signs nobody out.
 */
export function clearSessionCookie(cookies: SessionCookieWriter, url: URL): void {
	cookies.delete(SESSION_COOKIE, cookieAttributes(url, 0));
}
