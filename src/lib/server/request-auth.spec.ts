import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { resolveRequestAuth, sessionTokenFrom } from './request-auth';
import type { RequestAuthDependencies } from './request-auth';
import type { Auth } from './users/types';

const COOKIE_TOKEN = 'c'.repeat(43);
const BEARER_TOKEN = 'b'.repeat(43);
const database = {} as DatabaseSync;
const auth = { account: {}, session: {}, households: [] } as unknown as Auth;

function request(authorization?: string): Request {
	return authorization === undefined
		? new Request('https://fit.test/today')
		: new Request('https://fit.test/today', { headers: { authorization } });
}

describe('sessionTokenFrom', () => {
	it('uses the cookie when no Authorization header is present', () => {
		expect(sessionTokenFrom(request(), COOKIE_TOKEN)).toBe(COOKIE_TOKEN);
	});

	it('accepts the case-insensitive Bearer scheme', () => {
		expect(sessionTokenFrom(request(`bearer ${BEARER_TOKEN}`), undefined)).toBe(BEARER_TOKEN);
	});

	it('gives an explicit Bearer token precedence over an ambient cookie', () => {
		expect(sessionTokenFrom(request(`Bearer ${BEARER_TOKEN}`), COOKIE_TOKEN)).toBe(BEARER_TOKEN);
	});

	it.each([
		'Basic credentials',
		'Bearer',
		'Bearer short',
		`Bearer  ${BEARER_TOKEN}`,
		`Bearer ${BEARER_TOKEN} extra`
	])('rejects malformed Authorization without falling back to the cookie: %s', (header) => {
		expect(sessionTokenFrom(request(header), COOKIE_TOKEN)).toBeUndefined();
	});

	it('rejects a malformed cookie token', () => {
		expect(sessionTokenFrom(request(), 'not-a-session')).toBeUndefined();
	});
});

describe('resolveRequestAuth', () => {
	it('does not open the database when credentials are absent', () => {
		const dependencies: RequestAuthDependencies = {
			database: vi.fn(() => database),
			resolve: vi.fn(() => auth)
		};
		expect(resolveRequestAuth(request(), undefined, dependencies)).toBeNull();
		expect(dependencies.database).not.toHaveBeenCalled();
		expect(dependencies.resolve).not.toHaveBeenCalled();
	});

	it('returns null when the session resolver reports an expired credential', () => {
		const dependencies: RequestAuthDependencies = {
			database: () => database,
			resolve: vi.fn(() => null)
		};
		expect(resolveRequestAuth(request(), COOKIE_TOKEN, dependencies)).toBeNull();
		expect(dependencies.resolve).toHaveBeenCalledWith(database, COOKIE_TOKEN);
	});

	it('does not turn a database failure into anonymous access', () => {
		const dependencies: RequestAuthDependencies = {
			database: () => {
				throw new Error('database unavailable');
			},
			resolve: vi.fn(() => auth)
		};
		expect(() => resolveRequestAuth(request(), COOKIE_TOKEN, dependencies)).toThrow(
			'database unavailable'
		);
		expect(dependencies.resolve).not.toHaveBeenCalled();
	});
});
