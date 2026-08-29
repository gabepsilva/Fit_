import type { Handle } from '@sveltejs/kit';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '$lib/server/db';
import { resolveSession } from '$lib/server/users/sessions';

/** The cookie the web build carries its session token in. */
export const SESSION_COOKIE = 'fit_session';

/**
 * The Android build has no SvelteKit server — it is a static bundle in a
 * WebView talking to this one across origins, where a cookie is awkward. It
 * sends the same token as a bearer instead, so the two targets share one
 * session table and differ only in how the token rides along.
 */
function tokenFrom(request: Request, cookie: string | undefined): string | undefined {
	if (cookie) return cookie;
	const header = request.headers.get('authorization');
	return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
}

let database: DatabaseSync | undefined;

/**
 * Opened on first need rather than at import, so `vite dev` and the build do
 * not create a database file for a run that never authenticates anything.
 */
function db(): DatabaseSync {
	database ??= openDatabase(process.env['FIT_DB_PATH'] ?? 'data/app.sqlite');
	return database;
}

export const handle: Handle = async ({ event, resolve }) => {
	const token = tokenFrom(event.request, event.cookies.get(SESSION_COOKIE));
	event.locals.auth = token ? resolveSession(db(), token) : null;
	return resolve(event);
};
