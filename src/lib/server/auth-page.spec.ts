import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { authPageState, SIGNED_IN_DESTINATION } from './auth-page';
import type { Auth } from './users/types';

function signedIn(): Auth {
	return {
		account: { id: 'a-1', username: 'robin', displayName: 'Robin', createdAt: '2026-08-01' },
		session: { id: 's-1', accountId: 'a-1', expiresAt: '2026-11-27T00:00:00.000Z' },
		households: [{ householdId: 'h-1', name: 'Home', role: 'owner' }]
	};
}

/**
 * The redirect is thrown rather than returned, which is how SvelteKit stops a
 * load from anywhere inside it. Catching it here rather than asserting inside a
 * `catch` keeps every assertion on the straight line of the test.
 */
function turnedAway(): unknown {
	try {
		authPageState(signedIn());
	} catch (thrown) {
		return thrown;
	}
	return null;
}

describe('authPageState', () => {
	it('lets an anonymous visitor see the form', () => {
		expect(authPageState(null)).toEqual({ serverChecked: true });
	});

	it('says a server looked, which the static build cannot say', () => {
		expect(authPageState(null).serverChecked).toBe(true);
	});

	it('turns a signed-in visitor away from the form', () => {
		expect(turnedAway()).not.toBeNull();
	});

	it('turns them away with a redirect rather than an error', () => {
		expect(isRedirect(turnedAway())).toBe(true);
	});

	it('sends them to the journal', () => {
		expect(turnedAway()).toMatchObject({ location: SIGNED_IN_DESTINATION });
	});

	it('redirects with 303, because what follows is a GET whatever this was', () => {
		expect(turnedAway()).toMatchObject({ status: 303 });
	});
});
