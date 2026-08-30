import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { SignedInSession } from '$lib/auth/api';
import { session } from '$lib/state/session.svelte';
import AccountMenu from './AccountMenu.svelte';

type Sent = { path: string; method: string | undefined };

function pathOf(input: string | URL | Request): string {
	if (typeof input === 'string') return input;
	return input instanceof URL ? input.pathname : new URL(input.url).pathname;
}

function answer(status: number, body: unknown = null): Sent[] {
	const sent: Sent[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
		sent.push({ path: pathOf(input), method: init?.method });
		return Promise.resolve(
			body === null
				? new Response(null, { status })
				: new Response(JSON.stringify(body), {
						status,
						headers: { 'content-type': 'application/json' }
					})
		);
	});
	return sent;
}

const SESSION: SignedInSession = {
	account: { id: 'a-1', username: 'robin', displayName: 'Robin', createdAt: '2026-08-01' },
	households: [{ householdId: 'h-1', name: 'Home', role: 'owner' }],
	expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
};

function signedIn() {
	session.begin(SESSION);
}

beforeEach(() => {
	localStorage.clear();
	session.current = null;
	session.hydrated = false;
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('AccountMenu, signed out', () => {
	it('offers a way in', async () => {
		await render(AccountMenu);
		await expect
			.element(page.getByRole('link', { name: 'Sign in' }))
			.toHaveAttribute('href', '/signin');
	});

	it('offers a way to register', async () => {
		await render(AccountMenu);
		await expect
			.element(page.getByRole('link', { name: 'Create an account' }))
			.toHaveAttribute('href', '/signup');
	});

	it('says the journal works without one, because it does', async () => {
		await render(AccountMenu);
		await expect.element(page.getByText('The journal works without one.')).toBeInTheDocument();
	});

	it('offers no sign-out for a session nobody has', async () => {
		await render(AccountMenu);
		expect(page.getByRole('button', { name: 'Sign out', exact: true }).elements()).toHaveLength(0);
	});
});

describe('AccountMenu, signed in', () => {
	it('names who is signed in', async () => {
		signedIn();
		await render(AccountMenu);
		await expect.element(page.getByText('Robin', { exact: true })).toBeInTheDocument();
	});

	it('names the household every row is filtered by', async () => {
		signedIn();
		await render(AccountMenu);
		await expect.element(page.getByText('@robin · Home')).toBeInTheDocument();
	});

	it('ends this device’s session at the current-session endpoint', async () => {
		signedIn();
		const sent = answer(204);
		await render(AccountMenu);
		await page.getByRole('button', { name: 'Sign out', exact: true }).click();
		await vi.waitFor(() =>
			expect(sent[0]).toEqual({ path: '/api/sessions/current', method: 'DELETE' })
		);
	});

	it('forgets the account once the server has answered', async () => {
		signedIn();
		answer(204);
		await render(AccountMenu);
		await page.getByRole('button', { name: 'Sign out', exact: true }).click();
		await vi.waitFor(() => expect(session.signedIn).toBe(false));
	});

	it('ends every session at the collection endpoint', async () => {
		signedIn();
		const sent = answer(204);
		await render(AccountMenu);
		await page.getByRole('button', { name: 'Sign out everywhere' }).click();
		await vi.waitFor(() => expect(sent[0]).toEqual({ path: '/api/sessions', method: 'DELETE' }));
	});

	it('forgets the account after signing out everywhere', async () => {
		signedIn();
		answer(204);
		await render(AccountMenu);
		await page.getByRole('button', { name: 'Sign out everywhere' }).click();
		await vi.waitFor(() => expect(session.signedIn).toBe(false));
	});

	it('forgets a session the server says it never had', async () => {
		signedIn();
		answer(401, { error: { code: 'unauthenticated' } });
		await render(AccountMenu);
		await page.getByRole('button', { name: 'Sign out everywhere' }).click();
		await vi.waitFor(() => expect(session.signedIn).toBe(false));
	});

	it('keeps the record when nothing was asked and nothing answered', async () => {
		signedIn();
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
		await render(AccountMenu);
		await page.getByRole('button', { name: 'Sign out', exact: true }).click();
		await expect.element(page.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled();
		expect(session.signedIn).toBe(true);
	});
});
