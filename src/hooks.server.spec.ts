import type { Handle } from '@sveltejs/kit';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { createHandle } from './hooks.server';
import type { RequestAuthDependencies } from '$lib/server/request-auth';
import { SESSION_COOKIE } from '$lib/server/session-cookie';
import type { Auth } from '$lib/server/users/types';

const TOKEN = 't'.repeat(43);
const database = {} as DatabaseSync;
const auth = { account: {}, session: {}, households: [] } as unknown as Auth;

function handleInput(cookie: string | undefined): Parameters<Handle>[0] {
	const event = {
		cookies: { get: vi.fn((name: string) => (name === SESSION_COOKIE ? cookie : undefined)) },
		locals: { auth: null },
		request: new Request('https://fit.test/today')
	};
	return {
		event: event as unknown as Parameters<Handle>[0]['event'],
		resolve: vi.fn(() => Promise.resolve(new Response('resolved')))
	};
}

describe('createHandle', () => {
	it('assigns resolved authentication before continuing the request', async () => {
		const dependencies: RequestAuthDependencies = {
			database: () => database,
			resolve: () => auth
		};
		const input = handleInput(TOKEN);
		const response = await createHandle(dependencies)(input);
		expect(input.event.locals.auth).toBe(auth);
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
