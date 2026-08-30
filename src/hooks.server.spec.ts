import type { Handle } from '@sveltejs/kit';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { createHandle } from './hooks.server';
import type { RequestAuthDependencies } from '$lib/server/request-auth';
import { SESSION_COOKIE } from '$lib/server/session-cookie';
import type { Auth } from '$lib/server/users/types';

const SITE = 'https://fit.test';
const TOKEN = 't'.repeat(43);
const database = {} as DatabaseSync;
const auth = { account: {}, session: {}, households: [] } as unknown as Auth;

type RequestOptions = { method?: string; origin?: string; authorization?: string };

function handleInput(
	cookie: string | undefined,
	options: RequestOptions = {}
): Parameters<Handle>[0] {
	const headers = new Headers();
	if (options.origin !== undefined) headers.set('origin', options.origin);
	if (options.authorization !== undefined) headers.set('authorization', options.authorization);
	const event = {
		cookies: { get: vi.fn((name: string) => (name === SESSION_COOKIE ? cookie : undefined)) },
		locals: { auth: null },
		url: new URL(`${SITE}/today`),
		request: new Request(`${SITE}/today`, { method: options.method ?? 'GET', headers })
	};
	return {
		event: event as unknown as Parameters<Handle>[0]['event'],
		resolve: vi.fn(() => Promise.resolve(new Response('resolved')))
	};
}

const resolves: RequestAuthDependencies = { database: () => database, resolve: () => auth };

async function errorBody(response: Response): Promise<unknown> {
	return (await response.json()) as unknown;
}

describe('createHandle', () => {
	it('assigns resolved authentication before continuing the request', async () => {
		const input = handleInput(TOKEN);
		const response = await createHandle(resolves)(input);
		expect(input.event.locals.auth).toBe(auth);
		expect(input.event.cookies.get).toHaveBeenCalledWith('fit_session');
		expect(await response.text()).toBe('resolved');
	});

	it('continues anonymous requests without opening the database', async () => {
		const dependencies: RequestAuthDependencies = {
			database: vi.fn(() => database),
			resolve: vi.fn(() => auth)
		};
		const input = handleInput(undefined);
		await createHandle(dependencies)(input);
		expect(input.event.locals.auth).toBeNull();
		expect(dependencies.database).not.toHaveBeenCalled();
	});

	it('propagates authentication failures without continuing the request', async () => {
		const dependencies: RequestAuthDependencies = {
			database: () => database,
			resolve: () => {
				throw new Error('authentication failed closed');
			}
		};
		const input = handleInput(TOKEN);
		await expect(createHandle(dependencies)(input)).rejects.toThrow('authentication failed closed');
		expect(input.resolve).not.toHaveBeenCalled();
	});
});

describe('createHandle origin policy', () => {
	it('refuses a state-changing request from another site', async () => {
		const input = handleInput(TOKEN, { method: 'POST', origin: 'https://evil.example' });
		const response = await createHandle(resolves)(input);
		expect(response.status).toBe(403);
		expect(await errorBody(response)).toEqual({
			error: { code: 'forbidden-origin', reason: 'foreign-origin' }
		});
	});

	it('refuses a state-changing request that sends no Origin at all', async () => {
		const input = handleInput(TOKEN, { method: 'POST' });
		expect(await errorBody(await createHandle(resolves)(input))).toEqual({
			error: { code: 'forbidden-origin', reason: 'missing-origin' }
		});
	});

	it('refuses before the request reaches the route it was aimed at', async () => {
		const input = handleInput(TOKEN, { method: 'POST', origin: 'https://evil.example' });
		await createHandle(resolves)(input);
		expect(input.resolve).not.toHaveBeenCalled();
	});

	it('refuses before authentication, so a rejected request costs no lookup', async () => {
		const dependencies: RequestAuthDependencies = {
			database: vi.fn(() => database),
			resolve: vi.fn(() => auth)
		};
		const input = handleInput(TOKEN, { method: 'POST', origin: 'https://evil.example' });
		await createHandle(dependencies)(input);
		expect(dependencies.database).not.toHaveBeenCalled();
		expect(input.event.locals.auth).toBeNull();
	});

	it('allows a state-changing request from the origin it is served under', async () => {
		const input = handleInput(TOKEN, { method: 'POST', origin: SITE });
		const response = await createHandle(resolves)(input);
		expect(await response.text()).toBe('resolved');
	});

	it('allows the Android build, whose bearer token no other site can make it send', async () => {
		const input = handleInput(undefined, {
			method: 'POST',
			origin: 'http://localhost',
			authorization: `Bearer ${TOKEN}`
		});
		const response = await createHandle(resolves)(input);
		expect(await response.text()).toBe('resolved');
	});

	it.each(['PUT', 'PATCH', 'DELETE'])(
		'covers every unsafe method, not only POST: %s',
		async (method) => {
			const input = handleInput(TOKEN, { method, origin: 'https://evil.example' });
			expect((await createHandle(resolves)(input)).status).toBe(403);
		}
	);

	it('leaves page loads alone, so a link from another site still opens', async () => {
		const input = handleInput(TOKEN, { origin: 'https://elsewhere.example' });
		const response = await createHandle(resolves)(input);
		expect(await response.text()).toBe('resolved');
	});
});
