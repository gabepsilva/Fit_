import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignedInSession } from '$lib/auth/api';
import { session, SESSION_STORAGE_KEY } from './session.svelte';

const DAY_MS = 24 * 60 * 60 * 1000;

function signedInSession(expiresAt: string): SignedInSession {
	return {
		account: { id: 'a-1', username: 'robin', displayName: 'Robin', createdAt: '2026-08-01' },
		households: [
			{ householdId: 'h-1', name: 'Home', role: 'owner' },
			{ householdId: 'h-2', name: 'Cabin', role: 'member' }
		],
		expiresAt
	};
}

function inDays(days: number): string {
	return new Date(Date.now() + days * DAY_MS).toISOString();
}

beforeEach(() => {
	localStorage.clear();
	session.current = null;
	session.hydrated = false;
});

afterEach(() => {
	vi.restoreAllMocks();
});

/**
 * `fetch` is stubbed rather than pointed at a running server: what `refresh`
 * owns is which answers it believes, and a real endpoint would test the
 * endpoint instead. See `$lib/auth/api`'s own spec for the request shape.
 */
function stubFetch(response: Response | Error): void {
	vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
		response instanceof Error ? Promise.reject(response) : Promise.resolve(response)
	);
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		...init,
		headers: { 'content-type': 'application/json' }
	});
}

describe('session', () => {
	it('starts knowing nothing', () => {
		expect(session.signedIn).toBe(false);
	});

	it('has no account to name before anyone signs in', () => {
		expect(session.account).toBeNull();
	});

	it('has no household to name before anyone signs in', () => {
		expect(session.household).toBeNull();
	});

	it('holds the account a sign-in handed back', () => {
		session.begin(signedInSession(inDays(90)));
		expect(session.account?.displayName).toBe('Robin');
	});

	it('names the first household, which is the one the account owns', () => {
		session.begin(signedInSession(inDays(90)));
		expect(session.household?.name).toBe('Home');
	});

	it('reads as signed in while the session has time left', () => {
		session.begin(signedInSession(inDays(90)));
		expect(session.signedIn).toBe(true);
	});

	it('reads as signed out once the expiry has passed', () => {
		session.begin(signedInSession(inDays(-1)));
		expect(session.signedIn).toBe(false);
	});

	it('survives a reload', () => {
		session.begin(signedInSession(inDays(90)));
		session.current = null;
		session.hydrated = false;
		session.hydrate();
		expect(session.account?.username).toBe('robin');
	});

	it('never writes a token, because the browser was never given one', () => {
		session.begin(signedInSession(inDays(90)));
		expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toContain('token');
	});

	it('drops an expired record on the way in rather than naming a dead session', () => {
		localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(signedInSession(inDays(-1))));
		session.hydrate();
		expect(session.current).toBeNull();
	});

	it('clears the storage an expired record was read from', () => {
		localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(signedInSession(inDays(-1))));
		session.hydrate();
		expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
	});

	it('reads a corrupt payload as signed out rather than throwing', () => {
		localStorage.setItem(SESSION_STORAGE_KEY, '{not json');
		session.hydrate();
		expect(session.signedIn).toBe(false);
	});

	it('rejects a payload that is not a session at all', () => {
		localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ account: 'robin' }));
		session.hydrate();
		expect(session.current).toBeNull();
	});

	it('is hydrated even when there was nothing to restore', () => {
		session.hydrate();
		expect(session.hydrated).toBe(true);
	});

	it('does not read storage a second time', () => {
		session.hydrate();
		localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(signedInSession(inDays(90))));
		session.hydrate();
		expect(session.current).toBeNull();
	});

	it('forgets the account when the session ends', () => {
		session.begin(signedInSession(inDays(90)));
		session.forget();
		expect(session.signedIn).toBe(false);
	});

	it('leaves nothing in storage when the session ends', () => {
		session.begin(signedInSession(inDays(90)));
		session.forget();
		expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
	});

	it('takes the session the server reports over the one it remembered', async () => {
		session.begin(signedInSession(inDays(90)));
		const renewed = signedInSession(inDays(30));
		stubFetch(jsonResponse(renewed));
		await expect(session.refresh()).resolves.toBe(true);
		expect(session.current).toEqual(renewed);
	});

	it('stores what the server reported, so the next reload starts from it', async () => {
		stubFetch(jsonResponse(signedInSession(inDays(30))));
		await session.refresh();
		expect(localStorage.getItem(SESSION_STORAGE_KEY)).toContain('robin');
	});

	it('signs the device out when the server says there is no session', async () => {
		session.begin(signedInSession(inDays(90)));
		stubFetch(jsonResponse({ error: { code: 'unauthenticated' } }, { status: 401 }));
		await expect(session.refresh()).resolves.toBe(false);
		expect(session.signedIn).toBe(false);
		expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
	});

	it('keeps the record when the request never arrived, rather than guessing', async () => {
		// Offline is not signed out. Dropping the record here would sign someone
		// out of a working session every time they went through a tunnel.
		session.begin(signedInSession(inDays(90)));
		stubFetch(new TypeError('Failed to fetch'));
		await expect(session.refresh()).resolves.toBe(false);
		expect(session.signedIn).toBe(true);
		expect(localStorage.getItem(SESSION_STORAGE_KEY)).toContain('robin');
	});
});
