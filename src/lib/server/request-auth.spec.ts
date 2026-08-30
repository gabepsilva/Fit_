import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { getDatabase } from './db';
import {
	hasBearerCredential,
	requestAuthDependencies,
	resolveRequestAuth,
	sessionTokenFrom
} from './request-auth';
import type { RequestAuthDependencies } from './request-auth';
import { resolveSession } from './users/sessions';
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

	it.each([`${COOKIE_TOKEN}x`, `x${COOKIE_TOKEN}`])(
		'rejects a valid-looking cookie token with extra data: %s',
		(token) => {
			expect(sessionTokenFrom(request(), token)).toBeUndefined();
		}
	);

	it('rejects text prefixed to an otherwise valid Bearer credential', () => {
		expect(sessionTokenFrom(request(`xBearer ${BEARER_TOKEN}`), COOKIE_TOKEN)).toBeUndefined();
	});
});

describe('hasBearerCredential', () => {
	it('recognizes a well-formed bearer token', () => {
		expect(hasBearerCredential(request(`Bearer ${BEARER_TOKEN}`))).toBe(true);
	});

	it('recognizes the case-insensitive scheme the same way the parser does', () => {
		expect(hasBearerCredential(request(`bearer ${BEARER_TOKEN}`))).toBe(true);
	});

	it('reports no credential when the request carries only a cookie', () => {
		expect(hasBearerCredential(request())).toBe(false);
	});

	it.each(['Basic credentials', 'Bearer', 'Bearer short', `Bearer ${BEARER_TOKEN} extra`])(
		'refuses to call a malformed header a credential: %s',
		(header) => {
			expect(hasBearerCredential(request(header))).toBe(false);
		}
	);
});

describe('resolveRequestAuth', () => {
	it('wires the production database and session resolver by default', () => {
		expect(requestAuthDependencies).toEqual({ database: getDatabase, resolve: resolveSession });
	});

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

	it('returns the authentication resolved for a valid credential', () => {
		const dependencies: RequestAuthDependencies = {
			database: () => database,
			resolve: () => auth
		};
		expect(resolveRequestAuth(request(), COOKIE_TOKEN, dependencies)).toBe(auth);
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
