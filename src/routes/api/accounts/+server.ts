import { register } from '$lib/server/auth-endpoints';
import { getDatabase } from '$lib/server/db';
import type { RequestHandler } from './$types';

/** Register: create the account, the household it owns and its profile, then sign it in. */
export const POST: RequestHandler = (event) => register(getDatabase(), event);
