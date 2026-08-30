import { afterEach, describe, expect, it, vi } from 'vitest';
import { register, retryAfterSeconds, signIn, signOut, signOutEverywhere } from './api';

type Call = {
	path: string;
	method: string | undefined;
	contentType: string | undefined;
	body: Record<string, string> | null;
};

function pathOf(input: string | URL | Request): string {
	if (typeof input === 'string') return input;
	return input instanceof URL ? input.pathname : new URL(input.url).pathname;
}

function bodyOf(body: BodyInit | null | undefined): Record<string, string> | null {
	return typeof body === 'string' ? (JSON.parse(body) as Record<string, string>) : null;
}

function contentTypeOf(headers: HeadersInit | undefined): string | undefined {
	return headers === undefined
		? undefined
		: (new Headers(headers).get('content-type') ?? undefined);
}

/**
 * `fetch` is stubbed rather than pointed at a running server: what these
 * functions own is the shape of the request and the reading of the answer, and
 * a real endpoint would test the endpoint instead.
 */
function stub(response: Response | Error): Call[] {
	const calls: Call[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
		calls.push({
			path: pathOf(input),
			method: init?.method,
			contentType: contentTypeOf(init?.headers),
			body: bodyOf(init?.body)
		});
		return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
	});
	return calls;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		...init,
		headers: { 'content-type': 'application/json', ...init.headers }
	});
}

const SESSION = {
	account: { id: 'a-1', username: 'robin', displayName: 'Robin', createdAt: '2026-08-01' },
	households: [{ householdId: 'h-1', name: 'Home', role: 'owner' }],
	expiresAt: '2026-11-27T00:00:00.000Z'
};

const CREDENTIALS = { username: 'robin', password: 'a-long-password' };

const REGISTRATION = {
	username: 'robin',
	displayName: 'Robin',
	password: 'a-long-password',
	householdName: 'Home'
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe('signIn', () => {
	it('posts to the sessions endpoint', async () => {
		const calls = stub(jsonResponse(SESSION));
		await signIn(CREDENTIALS);
		expect(calls[0]?.path).toBe('/api/sessions');
	});

	it('declares JSON, which is the only body the endpoint accepts', async () => {
		const calls = stub(jsonResponse(SESSION));
		await signIn(CREDENTIALS);
		expect(calls[0]?.contentType).toBe('application/json');
	});

	it('sends the credentials as text fields', async () => {
		const calls = stub(jsonResponse(SESSION));
		await signIn(CREDENTIALS);
		expect(calls[0]?.body).toEqual(CREDENTIALS);
	});

	it('leaves out a device label nobody supplied, rather than sending an empty one', async () => {
		const calls = stub(jsonResponse(SESSION));
		await signIn(CREDENTIALS);
		expect(calls[0]?.body).not.toHaveProperty('deviceLabel');
	});

	it('returns the session the endpoint answered with', async () => {
		stub(jsonResponse(SESSION));
		const result = await signIn(CREDENTIALS);
		expect(result).toEqual({ ok: true, value: SESSION });
	});

	it('reports a rejected password as invalid credentials', async () => {
		stub(jsonResponse({ error: { code: 'invalid-credentials' } }, { status: 401 }));
		const result = await signIn(CREDENTIALS);
		expect(result).toEqual({ ok: false, failure: { code: 'invalid-credentials' } });
	});

	it('carries Retry-After back with a throttled attempt', async () => {
		stub(
			jsonResponse(
				{ error: { code: 'too-many-attempts' } },
				{ status: 429, headers: { 'retry-after': '45' } }
			)
		);
		const result = await signIn(CREDENTIALS);
		expect(result).toMatchObject({ failure: { code: 'too-many-attempts', retryAfterSeconds: 45 } });
	});

	it('carries the field and reason of a rejected input', async () => {
		stub(
			jsonResponse(
				{ error: { code: 'invalid-input', field: 'deviceLabel', reason: 'too-long' } },
				{ status: 400 }
			)
		);
		const result = await signIn({ ...CREDENTIALS, deviceLabel: 'x' });
		expect(result).toMatchObject({ failure: { field: 'deviceLabel', reason: 'too-long' } });
	});

	it('calls a dropped connection unreachable rather than a rejection', async () => {
		stub(new TypeError('Failed to fetch'));
		const result = await signIn(CREDENTIALS);
		expect(result).toEqual({ ok: false, failure: { code: 'unreachable' } });
	});

	it('refuses to invent a code for a failure body it does not recognize', async () => {
		stub(jsonResponse({ error: { code: 'teapot' } }, { status: 400 }));
		const result = await signIn(CREDENTIALS);
		expect(result).toMatchObject({ failure: { code: 'invalid-body' } });
	});
});

describe('register', () => {
	it('posts to the accounts endpoint', async () => {
		const calls = stub(jsonResponse(SESSION, { status: 201 }));
		await register(REGISTRATION);
		expect(calls[0]?.path).toBe('/api/accounts');
	});

	it('treats the 201 as a success', async () => {
		stub(jsonResponse(SESSION, { status: 201 }));
		const result = await register(REGISTRATION);
		expect(result).toEqual({ ok: true, value: SESSION });
	});

	it('sends a device label when one was given', async () => {
		const calls = stub(jsonResponse(SESSION, { status: 201 }));
		await register({ ...REGISTRATION, deviceLabel: 'Pixel' });
		expect(calls[0]?.body).toMatchObject({ deviceLabel: 'Pixel' });
	});

	it('reports a taken username', async () => {
		stub(jsonResponse({ error: { code: 'username-taken', field: 'username' } }, { status: 409 }));
		const result = await register(REGISTRATION);
		expect(result).toMatchObject({ failure: { code: 'username-taken', field: 'username' } });
	});
});

describe('signOut', () => {
	it('deletes the current session', async () => {
		const calls = stub(new Response(null, { status: 204 }));
		await signOut();
		expect(calls[0]).toMatchObject({ path: '/api/sessions/current', method: 'DELETE' });
	});

	it('sends no body, so no content type is declared', async () => {
		const calls = stub(new Response(null, { status: 204 }));
		await signOut();
		expect(calls[0]?.body).toBeNull();
	});

	it('succeeds on the empty 204', async () => {
		stub(new Response(null, { status: 204 }));
		await expect(signOut()).resolves.toEqual({ ok: true, value: null });
	});
});

describe('signOutEverywhere', () => {
	it('deletes the whole collection', async () => {
		const calls = stub(new Response(null, { status: 204 }));
		await signOutEverywhere();
		expect(calls[0]).toMatchObject({ path: '/api/sessions', method: 'DELETE' });
	});

	it('reports the refusal when nothing was signed in', async () => {
		stub(jsonResponse({ error: { code: 'unauthenticated' } }, { status: 401 }));
		const result = await signOutEverywhere();
		expect(result).toMatchObject({ failure: { code: 'unauthenticated' } });
	});
});

describe('retryAfterSeconds', () => {
	it('reads whole seconds', () => {
		expect(retryAfterSeconds(new Headers({ 'retry-after': '90' }))).toBe(90);
	});

	it('has nothing to say when the header is absent', () => {
		expect(retryAfterSeconds(new Headers())).toBeUndefined();
	});

	it('refuses a zero, which would tell someone to wait for nothing', () => {
		expect(retryAfterSeconds(new Headers({ 'retry-after': '0' }))).toBeUndefined();
	});

	it('refuses an HTTP-date, which this endpoint never sends', () => {
		expect(
			retryAfterSeconds(new Headers({ 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' }))
		).toBeUndefined();
	});
});
