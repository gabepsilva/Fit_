import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { SignedInSession } from '$lib/auth/api';
import { session } from '$lib/state/session.svelte';
import SignInPage from './+page.svelte';

const goto = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto }));

type Sent = { path: string; body: Record<string, string> };

function pathOf(input: string | URL | Request): string {
	if (typeof input === 'string') return input;
	return input instanceof URL ? input.pathname : new URL(input.url).pathname;
}

function answer(body: unknown, status: number, headers: Record<string, string> = {}): Sent[] {
	const sent: Sent[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
		sent.push({
			path: pathOf(input),
			body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, string>) : {}
		});
		return Promise.resolve(
			new Response(JSON.stringify(body), {
				status,
				headers: { 'content-type': 'application/json', ...headers }
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

async function open() {
	await render(SignInPage, { data: { serverChecked: true }, params: {}, form: null });
}

async function fillIn(name = 'robin', secret = 'a-long-password') {
	await page.getByLabelText('Username').fill(name);
	await page.getByLabelText('Password').fill(secret);
}

function submit() {
	return page.getByRole('button', { name: 'Sign in' }).click();
}

beforeEach(() => {
	localStorage.clear();
	session.current = null;
	session.hydrated = false;
});

afterEach(() => {
	vi.restoreAllMocks();
	goto.mockClear();
});

describe('sign-in page', () => {
	it('asks for a username and a password', async () => {
		await open();
		await expect.element(page.getByLabelText('Username')).toBeInTheDocument();
		await expect.element(page.getByLabelText('Password')).toBeInTheDocument();
	});

	it('signs in at the sessions endpoint', async () => {
		const sent = answer(SESSION, 200);
		await open();
		await fillIn();
		await submit();
		await vi.waitFor(() => expect(sent[0]?.path).toBe('/api/sessions'));
	});

	it('sends the device label when one was typed', async () => {
		const sent = answer(SESSION, 200);
		await open();
		await fillIn();
		await page.getByLabelText('Name this device').fill('Pixel');
		await submit();
		await vi.waitFor(() => expect(sent[0]?.body.deviceLabel).toBe('Pixel'));
	});

	it('remembers the account it signed in as', async () => {
		answer(SESSION, 200);
		await open();
		await fillIn();
		await submit();
		await vi.waitFor(() => expect(session.account?.username).toBe('robin'));
	});

	it('sends someone who has signed in to their journal', async () => {
		answer(SESSION, 200);
		await open();
		await fillIn();
		await submit();
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/'));
	});

	it('says the same thing for a wrong name as for a wrong password', async () => {
		answer({ error: { code: 'invalid-credentials' } }, 401);
		await open();
		await fillIn();
		await submit();
		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('That username and password don’t match.');
	});

	it('names neither box for a refused credential, because the server did not', async () => {
		answer({ error: { code: 'invalid-credentials' } }, 401);
		await open();
		await fillIn();
		await submit();
		await expect.element(page.getByRole('alert')).toBeInTheDocument();
		await expect
			.element(page.getByLabelText('Username'))
			.not.toHaveAttribute('aria-invalid', 'true');
	});

	it('signs nobody in when the credential was refused', async () => {
		answer({ error: { code: 'invalid-credentials' } }, 401);
		await open();
		await fillIn();
		await submit();
		await expect.element(page.getByRole('alert')).toBeInTheDocument();
		expect(session.signedIn).toBe(false);
	});

	it('says how long the throttle is holding, using Retry-After', async () => {
		answer({ error: { code: 'too-many-attempts' } }, 429, { 'retry-after': '45' });
		await open();
		await fillIn();
		await submit();
		await expect.element(page.getByRole('alert')).toHaveTextContent('45 seconds');
	});

	it('turns a long wait into minutes rather than a number to do arithmetic on', async () => {
		answer({ error: { code: 'too-many-attempts' } }, 429, { 'retry-after': '154' });
		await open();
		await fillIn();
		await submit();
		await expect.element(page.getByRole('alert')).toHaveTextContent('3 minutes');
	});

	it('stops the button while the throttle is holding', async () => {
		answer({ error: { code: 'too-many-attempts' } }, 429, { 'retry-after': '45' });
		await open();
		await fillIn();
		await submit();
		await expect.element(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
	});

	it('counts the wait down rather than leaving a sentence that stops being true', async () => {
		answer({ error: { code: 'too-many-attempts' } }, 429, { 'retry-after': '2' });
		await open();
		await fillIn();
		await submit();
		await expect.element(page.getByRole('alert')).toHaveTextContent('2 seconds');
		await vi.waitFor(
			async () => {
				await expect.element(page.getByRole('alert')).toHaveTextContent('The wait is over');
			},
			{ timeout: 5000 }
		);
	});

	it('lets the button work again once the wait is over', async () => {
		answer({ error: { code: 'too-many-attempts' } }, 429, { 'retry-after': '1' });
		await open();
		await fillIn();
		await submit();
		await vi.waitFor(
			async () => {
				await expect.element(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
			},
			{ timeout: 5000 }
		);
	});

	it('still says something useful when the throttle sent no header to count', async () => {
		answer({ error: { code: 'too-many-attempts' } }, 429);
		await open();
		await fillIn();
		await submit();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Try again shortly.');
	});

	it('puts a rejected device label under the device label', async () => {
		answer({ error: { code: 'invalid-input', field: 'deviceLabel', reason: 'too-long' } }, 400);
		await open();
		await fillIn();
		await page.getByLabelText('Name this device').fill('x');
		await submit();
		await expect
			.element(page.getByLabelText('Name this device'))
			.toHaveAttribute('aria-invalid', 'true');
	});

	it('separates a server it could not reach from a credential it refused', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
		await open();
		await fillIn();
		await submit();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Couldn’t reach the server');
	});

	it('forgets a record the server has just disproved by letting this page render', async () => {
		session.begin(SESSION);
		await open();
		await vi.waitFor(() => expect(session.signedIn).toBe(false));
	});

	it('offers the way to the sign-up form', async () => {
		await open();
		await expect
			.element(page.getByRole('link', { name: 'Create one' }))
			.toHaveAttribute('href', '/signup');
	});
});
