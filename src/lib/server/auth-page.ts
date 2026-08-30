import { redirect } from '@sveltejs/kit';
import type { Auth } from './users/types';

/**
 * What a sign-in or sign-up page's server `load` answers.
 *
 * It lives here rather than in the two route files for the reason
 * `auth-endpoints.ts` gives: `src/lib/server/` is what the `server` vitest
 * project measures and mutates, and a redirect written in a `+page.server.ts`
 * would be tested by nothing.
 *
 * The session is read from `locals.auth`, which `hooks.server.ts` has already
 * resolved for this request. There is deliberately no endpoint to ask "am I
 * signed in": the browser cannot read an `HttpOnly` cookie, so the only place
 * that question can be answered is the server, and the framework already
 * carries an answer to every page.
 */

/** Where a visitor who already has a session is sent instead of a form. */
export const SIGNED_IN_DESTINATION = '/';

/**
 * What the page is told, and where the redirect happens.
 *
 * `serverChecked` looks like a constant and is not. This app sets
 * `ssr = false`, so the value reaches the browser through a `__data.json`
 * request — and the Capacitor build is `adapter-static`, where that path
 * resolves to the SPA fallback page and the data silently arrives empty. So the
 * flag says something a boolean literal cannot: a server answered this page.
 * The form uses it to decide whether it may treat its cached session record as
 * disproved, which it may only do when a server actually looked.
 */
export function authPageState(auth: Auth | null): { serverChecked: true } {
	// A person holding a session has no business on a sign-in form, and 303
	// rather than 307 because what follows is a GET whatever this request was.
	if (auth !== null) redirect(303, SIGNED_IN_DESTINATION);
	return { serverChecked: true };
}
