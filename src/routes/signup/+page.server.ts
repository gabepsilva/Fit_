import { authPageState } from '$lib/server/auth-page';
import type { PageServerLoad } from './$types';

/** Registering while signed in would strand the session this request already carries. */
export const load: PageServerLoad = ({ locals }) => authPageState(locals.auth);
