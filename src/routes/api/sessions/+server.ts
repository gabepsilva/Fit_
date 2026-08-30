import { signIn } from '$lib/server/auth-endpoints';
import { getDatabase } from '$lib/server/db';
import type { RequestHandler } from './$types';

/** Sign in: verify the password and start a session. */
export const POST: RequestHandler = (event) => signIn(getDatabase(), event);
