import type { Handle } from '@sveltejs/kit';
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
 */
export function createHandle(
	dependencies: RequestAuthDependencies = requestAuthDependencies
): Handle {
	return async ({ event, resolve }) => {
		event.locals.auth = resolveRequestAuth(
			event.request,
			event.cookies.get(SESSION_COOKIE),
			dependencies
		);
		return resolve(event);
	};
}

export const handle: Handle = createHandle();
