import { signOut } from '$lib/server/auth-endpoints';
import { getDatabase } from '$lib/server/db';
import type { RequestHandler } from './$types';

/** Sign out: revoke the session this request presented and clear its cookie. */
export const DELETE: RequestHandler = (event) => signOut(getDatabase(), event);
