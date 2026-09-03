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
 * Dependencies are injectable so the trust boundary is testable without the
 * application database. The origin policy runs here, not per-route, so a new
 * route is covered the day it exists and opting out is deliberate. It runs
 * before auth: a refused request must not first cost a database lookup.
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
