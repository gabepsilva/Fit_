import { beforeEach, describe, expect, it } from 'vitest';
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
});
