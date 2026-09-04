import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Which build is answering.
 *
 * Unauthenticated on purpose: it says nothing a visitor cannot already read off
 * the foot of the side navigation, and the deploy's smoke check has to be able
 * to ask before it has an account. The hook in `hooks.server.ts` gives it
 * `no-cache` like every other answer this application produces, so a cache
 * cannot make a new release look like the old one.
 *
 * The two values are the same build-time constants `$lib/version` gives the
 * interface, read here directly so the running server and the phone can only
 * ever say the same string.
 */
export const GET: RequestHandler = () => json({ version: __APP_VERSION__, commit: __APP_COMMIT__ });
