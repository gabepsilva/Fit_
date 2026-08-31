import type { Handle } from '@sveltejs/kit';
import { apiError } from '$lib/server/api';
import { checkOrigin } from '$lib/server/origin-policy';
import {
	requestAuthDependencies,
	resolveRequestAuth,
	type RequestAuthDependencies
} from '$lib/server/request-auth';
import { SESSION_COOKIE } from '$lib/server/session-cookie';

/**
 * The Android build sends a bearer token; the web build carries the same token
 * in a cookie. Dependencies are injectable so this trust boundary is tested
 * without opening the process-wide application database.
 *
 * The origin policy runs here rather than inside each endpoint, and that is the
 * whole reason it is worth writing: a per-route check protects the routes
 * somebody remembered to add it to, and an endpoint written next month that
 * forgets it is unprotected with no failing test to say so. Here, every route
 * that will ever exist is covered the day it is created, and opting out has to
 * be deliberate and visible. Safe methods and bearer requests are exempt inside
 * `checkOrigin`, so this costs a page render two header reads.
 *
 * It runs before authentication for the same reason `checkSignIn` runs before
 * scrypt: a refused request should not first cost a database lookup.
 */
export function createHandle(
	dependencies: RequestAuthDependencies = requestAuthDependencies
): Handle {
	return async ({ event, resolve }) => {
		const origin = checkOrigin(event.request, event.url);
		if (!origin.allowed) return apiError('forbidden-origin', { reason: origin.reason });
		event.locals.auth = resolveRequestAuth(
			event.request,
			event.cookies.get(SESSION_COOKIE),
			dependencies
		);
		return resolve(event);
	};
}

export const handle: Handle = createHandle();
