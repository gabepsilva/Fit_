import { currentSession, signOut } from '$lib/server/auth-endpoints';
import { getDatabase } from '$lib/server/db';
import type { RequestHandler } from './$types';

/** Read this request's own session, which is the only one it may ask about. */
export const GET: RequestHandler = (event) => currentSession(event);

/** Sign out: revoke the session this request presented and clear its cookie. */
export const DELETE: RequestHandler = (event) => signOut(getDatabase(), event);
