import type { Cookies } from '@sveltejs/kit';

/**
 * The only place the session cookie is written and removed.
 *
 * Write and removal attributes must stay identical, or the browser keeps a
 * second, weaker same-named cookie. The Android build never uses this: it
 * sends the same token as `Authorization: Bearer`.
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
 * `Strict` drops the cookie when a link from elsewhere opens the site, which
 * looks like a lost session. `Lax` still withholds it on cross-site POSTs; the
 * origin policy covers what it does not.
 */
const SAME_SITE = 'lax' as const;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * `Secure` everywhere except loopback HTTP, where `vite dev` cannot serve TLS.
 * A non-loopback host in plain HTTP still gets `Secure`, so a misconfigured
 * deployment fails visibly at sign-in.
 */
function isSecureContext(url: URL): boolean {
	return url.protocol === 'https:' || !LOOPBACK_HOSTS.has(url.hostname);
}

function cookieAttributes(url: URL, maxAge: number) {
	return {
		path: COOKIE_PATH,
		// `HttpOnly`: an XSS cannot exfiltrate the token, only ride the session.
		httpOnly: true,
		secure: isSecureContext(url),
		sameSite: SAME_SITE,
		maxAge
	};
}

/**
 * Write the session cookie so it dies with the row behind it.
 *
 * `maxAge` is derived from the session's own expiry, so the cookie never
 * outlives the row it carries.
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
 * Attributes must match the write: the browser matches a removal on name,
 * path and domain, and a mismatched `path` signs nobody out.
 */
export function clearSessionCookie(cookies: SessionCookieWriter, url: URL): void {
	cookies.delete(SESSION_COOKIE, cookieAttributes(url, 0));
}
