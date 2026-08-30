import { authPageState } from '$lib/server/auth-page';
import type { PageServerLoad } from './$types';

/** A visitor the request hook already resolved a session for has no form to fill in. */
export const load: PageServerLoad = ({ locals }) => authPageState(locals.auth);
