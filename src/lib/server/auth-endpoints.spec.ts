import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	currentSession,
	register,
	SESSION_DELIVERY_HEADER,
	signIn,
	signOut,
	signOutEverywhere
} from './auth-endpoints';
import type { AuthEvent } from './auth-endpoints';
import { openDatabase } from './db';
import { SESSION_COOKIE } from './session-cookie';
import { resolveSession } from './users/sessions';
import { REGISTRATION_POLICY } from './users/throttle';

/** See the note in `password.spec.ts`: the production cost is too slow to test at. */
const CHEAP = { n: 2 ** 12, r: 8, p: 1 };

const SITE = 'https://fit.example';
const ADDRESS = '203.0.113.7';

const REGISTRATION = {
	username: 'jordan',
	displayName: 'Jordan',
	password: 'correct horse battery',
	householdName: 'Flat 3'
};

type EventOptions = {
	body?: unknown;
	headers?: Record<string, string>;
	cookie?: string;
	address?: string;
	path?: string;
};

type Written = { name: string; value: string };

type Harness = {
	event: AuthEvent;
	written: Written[];
	removed: string[];
};

function eventFor(options: EventOptions = {}): Harness {
	const written: Written[] = [];
	const removed: string[] = [];
	const headers = new Headers(options.headers ?? {});
	if (options.body !== undefined && !headers.has('content-type')) {
		headers.set('content-type', 'application/json');
	}
	const path = options.path ?? '/api/accounts';
	const event: AuthEvent = {
		request: new Request(`${SITE}${path}`, {
			method: 'POST',
			headers,
			...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
		}),
		url: new URL(`${SITE}${path}`),
		cookies: {
			get: (name) => (name === SESSION_COOKIE ? options.cookie : undefined),
			set: (name, value) => {
				written.push({ name, value });
			},
			delete: (name) => {
				removed.push(name);
			}
		},
		locals: { auth: null },
		getClientAddress: () => options.address ?? ADDRESS
	};
	return { event, written, removed };
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
	return (await response.json()) as Record<string, unknown>;
}

let db: DatabaseSync;

beforeEach(() => {
	db = openDatabase(':memory:');
});

/**
 * Each case opens its own in-memory database, and closing it is load-bearing:
 * a mutation run replays this suite hundreds of times per worker, and the
 * leaked `node:sqlite` handles take the worker down with SIGSEGV, which Stryker
 * records as a timeout against whichever mutant was running.
 */
afterEach(() => {
	db.close();
});

describe('register', () => {
	it('creates the account, its household and its profile', async () => {
		const { event } = eventFor({ body: REGISTRATION });
		expect((await register(db, event, CHEAP)).status).toBe(201);
		expect(db.prepare('select count(*) as n from account').get()?.['n']).toBe(1);
		expect(db.prepare('select count(*) as n from household').get()?.['n']).toBe(1);
		expect(db.prepare('select count(*) as n from membership').get()?.['n']).toBe(1);
		expect(db.prepare('select count(*) as n from profile').get()?.['n']).toBe(1);
	});

	it('answers with the account and the household it may read', async () => {
		const { event } = eventFor({ body: REGISTRATION });
		const body = await bodyOf(await register(db, event, CHEAP));
		expect(body['account']).toMatchObject({ username: 'jordan', displayName: 'Jordan' });
		expect(body['households']).toMatchObject([{ name: 'Flat 3', role: 'owner' }]);
		expect(body['expiresAt']).toStrictEqual(expect.any(String));
	});

	it('never lets the stored password hash out of the module that reads it', async () => {
		const { event } = eventFor({ body: REGISTRATION });
		const response = await register(db, event, CHEAP);
		const stored = db.prepare('select password_hash from account').get()?.['password_hash'];
		const text = await response.text();
		expect(String(stored)).not.toBe('undefined');
		expect(text).not.toContain(String(stored));
		expect(text).not.toContain('password');
	});

	it('signs the web client in with the cookie and keeps the token out of the body', async () => {
		const { event, written } = eventFor({ body: REGISTRATION });
		const body = await bodyOf(await register(db, event, CHEAP));
		expect(body['token']).toBeUndefined();
		expect(written).toHaveLength(1);
		expect(written[0]?.name).toBe(SESSION_COOKIE);
	});

	it('issues a cookie that resolves to the account that just registered', async () => {
		const { event, written } = eventFor({ body: REGISTRATION });
		await register(db, event, CHEAP);
		const resolved = resolveSession(db, written[0]?.value ?? '');
		expect(resolved?.account.username).toBe('jordan');
	});

	it('hands the Android build a token and sets no cookie for it', async () => {
		const { event, written } = eventFor({
			body: REGISTRATION,
			headers: { [SESSION_DELIVERY_HEADER]: 'bearer' }
		});
		const body = await bodyOf(await register(db, event, CHEAP));
		expect(written).toHaveLength(0);
		expect(resolveSession(db, String(body['token']))?.account.username).toBe('jordan');
	});

	it('records the device label the client named', async () => {
		const { event } = eventFor({ body: { ...REGISTRATION, deviceLabel: 'Pixel 7' } });
		await register(db, event, CHEAP);
		expect(db.prepare('select device_label from session').get()?.['device_label']).toBe('Pixel 7');
	});

	it('answers a bearer registration with the created status, not a plain 200', async () => {
		const { event } = eventFor({
			body: REGISTRATION,
			headers: { [SESSION_DELIVERY_HEADER]: 'bearer' }
		});
		const response = await register(db, event, CHEAP);
		expect(response.status).toBe(201);
		expect(String((await bodyOf(response))['token'])).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it('reads an absent username as an empty one rather than as a name of its own', async () => {
		const { event } = eventFor({
			body: {
				displayName: REGISTRATION.displayName,
				password: REGISTRATION.password,
				householdName: REGISTRATION.householdName
			}
		});
		expect(await bodyOf(await register(db, event, CHEAP))).toEqual({
			error: { code: 'invalid-input', field: 'username', reason: 'too-short' }
		});
	});

	it('reads an absent password as an empty one rather than as a password', async () => {
		const { event } = eventFor({
			body: {
				username: REGISTRATION.username,
				displayName: REGISTRATION.displayName,
				householdName: REGISTRATION.householdName
			}
		});
		expect(await bodyOf(await register(db, event, CHEAP))).toEqual({
			error: { code: 'invalid-input', field: 'password', reason: 'too-short' }
		});
		expect(db.prepare('select count(*) as n from account').get()?.['n']).toBe(0);
	});

	it('falls back to the username when no display name is given', async () => {
		const { event } = eventFor({
			body: {
				username: REGISTRATION.username,
				password: REGISTRATION.password,
				householdName: REGISTRATION.householdName
			}
		});
		const body = await bodyOf(await register(db, event, CHEAP));
		expect(body['account']).toMatchObject({ displayName: 'jordan' });
	});

	it('names the household after the display name when none is given', async () => {
		const { event } = eventFor({
			body: {
				username: REGISTRATION.username,
				displayName: REGISTRATION.displayName,
				password: REGISTRATION.password
			}
		});
		const body = await bodyOf(await register(db, event, CHEAP));
		expect(body['households']).toMatchObject([{ name: 'Jordan', role: 'owner' }]);
	});

	it('refuses a username already in use', async () => {
		await register(db, eventFor({ body: REGISTRATION }).event, CHEAP);
		const response = await register(db, eventFor({ body: REGISTRATION }).event, CHEAP);
		expect(response.status).toBe(409);
		expect(await bodyOf(response)).toEqual({
			error: { code: 'username-taken', field: 'username' }
		});
	});

	it('refuses a name that differs only in case, which would impersonate on sight', async () => {
		await register(db, eventFor({ body: REGISTRATION }).event, CHEAP);
		const shouting = eventFor({ body: { ...REGISTRATION, username: 'JORDAN' } });
		expect((await register(db, shouting.event, CHEAP)).status).toBe(409);
	});

	it.each([
		[{ username: 'jo' }, 'username', 'too-short'],
		[{ username: 'jordan!' }, 'username', 'unsupported-characters'],
		[{ password: 'short' }, 'password', 'too-short'],
		[{ displayName: 'J'.repeat(101) }, 'displayName', 'too-long'],
		[{ householdName: 'Flat\u202E3' }, 'householdName', 'unsafe-characters']
	])('refuses %o as invalid input on %s', async (override, field, reason) => {
		const { event } = eventFor({ body: { ...REGISTRATION, ...override } });
		const response = await register(db, event, CHEAP);
		expect(response.status).toBe(400);
		expect(await bodyOf(response)).toEqual({ error: { code: 'invalid-input', field, reason } });
	});

	it('refuses an oversize device label before it creates an account', async () => {
		const { event } = eventFor({ body: { ...REGISTRATION, deviceLabel: 'p'.repeat(101) } });
		const response = await register(db, event, CHEAP);
		expect(await bodyOf(response)).toEqual({
			error: { code: 'invalid-input', field: 'deviceLabel', reason: 'too-long' }
		});
		expect(db.prepare('select count(*) as n from account').get()?.['n']).toBe(0);
	});

	it('refuses a body that is not JSON text fields', async () => {
		const { event } = eventFor({ body: { ...REGISTRATION, username: 7 } });
		const response = await register(db, event, CHEAP);
		expect(response.status).toBe(400);
		expect(await bodyOf(response)).toEqual({ error: { code: 'invalid-body' } });
	});

	it('refuses a request with no body at all', async () => {
		const { event } = eventFor();
		expect((await register(db, event, CHEAP)).status).toBe(400);
	});

	it('creates no account when the body is refused', async () => {
		await register(db, eventFor().event, CHEAP);
		expect(db.prepare('select count(*) as n from account').get()?.['n']).toBe(0);
	});

	it('lets one household sign several people up in one sitting', async () => {
		// The allowance is meant to be spent: several members share one address.
		for (let index = 0; index < 5; index += 1) {
			const { event } = eventFor({ body: { ...REGISTRATION, username: `member-${index}` } });
			expect((await register(db, event, CHEAP)).status).toBe(201);
		}
	});

	it('throttles the address once it has spent its allowance', async () => {
		await signUpUntilLocked();
		const response = await register(db, eventFor({ body: REGISTRATION }).event, CHEAP);
		expect(response.status).toBe(429);
		expect(await bodyOf(response)).toEqual({ error: { code: 'too-many-attempts' } });
		expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
	});

	it('says how long to wait in whole seconds, the way sign-in does', async () => {
		await signUpUntilLocked();
		const response = await register(db, eventFor({ body: REGISTRATION }).event, CHEAP);
		const seconds = Number(response.headers.get('retry-after'));
		expect(seconds).toBeGreaterThan(50);
		expect(seconds).toBeLessThanOrEqual(60);
	});

	it('creates no account for an attempt it has refused to consider', async () => {
		await signUpUntilLocked();
		const before = db.prepare('select count(*) as n from account').get()?.['n'];
		const { event, written } = eventFor({ body: { ...REGISTRATION, username: 'latecomer' } });
		await register(db, event, CHEAP);
		expect(db.prepare('select count(*) as n from account').get()?.['n']).toBe(before);
		expect(written).toHaveLength(0);
	});

	it('counts a name that was already taken against the allowance too', async () => {
		// Enumeration: `username-taken` names who exists, so probing must cost
		// what registering does.
		for (let index = 0; index < REGISTRATION_POLICY.limit; index += 1) {
			const response = await register(db, eventFor({ body: REGISTRATION }).event, CHEAP);
			expect(response.status).toBe(index === 0 ? 201 : 409);
		}
		expect((await register(db, eventFor({ body: REGISTRATION }).event, CHEAP)).status).toBe(429);
	});

	it('counts the attempt before it derives, not after it succeeds', async () => {
		await register(db, eventFor({ body: REGISTRATION }).event, CHEAP);
		expect(
			db.prepare("select failures from sign_in_throttle where scope = 'registration'").get()?.[
				'failures'
			]
		).toBe(1);
	});

	it('leaves signing in alone while registration is held', async () => {
		// The registration and sign-in scopes serve different attacks, so locking
		// one must not block the other.
		await signUpUntilLocked();
		const response = await signIn(db, signInEvent({ username: 'spender-0' }).event, CHEAP);
		expect(response.status).toBe(200);
	});

	it('skips the address scope when a proxy nobody declared rewrote the connection', async () => {
		const { event } = eventFor({
			body: REGISTRATION,
			headers: { 'x-forwarded-for': '203.0.113.9' }
		});
		await register(db, event, CHEAP);
		expect(db.prepare('select count(*) as n from sign_in_throttle').get()?.['n']).toBe(0);
	});

	it('counts nothing when the body was refused before an address was read', async () => {
		await register(db, eventFor().event, CHEAP);
		expect(db.prepare('select count(*) as n from sign_in_throttle').get()?.['n']).toBe(0);
	});
});

/**
 * The sign-in throttle scopes in order, skipping the registration row every
 * case writes first.
 */
function signInScopes(): unknown[] {
	return db
		.prepare("select scope from sign_in_throttle where scope <> 'registration' order by scope")
		.all()
		.map((row) => row['scope']);
}

/** Register once, then drive sign-in against the account it left behind. */
async function registered(): Promise<void> {
	await register(db, eventFor({ body: REGISTRATION }).event, CHEAP);
}

type Credentials = { username?: string; password?: string; deviceLabel?: string };

function signInEvent(credentials: Credentials = {}, options: EventOptions = {}): Harness {
	return eventFor({
		path: '/api/sessions',
		...options,
		body: {
			username: REGISTRATION.username,
			password: REGISTRATION.password,
			...credentials
		}
	});
}

/** Spend the whole registration allowance from one address, which then locks. */
async function signUpUntilLocked(): Promise<void> {
	for (let index = 0; index < REGISTRATION_POLICY.limit; index += 1) {
		const { event } = eventFor({ body: { ...REGISTRATION, username: `spender-${index}` } });
		await register(db, event, CHEAP);
	}
}

/** Fail enough times to trip the username scope, which locks on the sixth. */
async function failUntilLocked(): Promise<void> {
	for (let attempt = 0; attempt < 6; attempt += 1) {
		await signIn(db, signInEvent({ password: 'wrong password entirely' }).event, CHEAP);
	}
}

describe('signIn', () => {
	beforeEach(registered);

	// First on purpose: the injected cost governs every derivation below, and a
	// mutant dropping it is caught here rather than after two dozen production-cost
	// sign-ins.
	it('fails closed rather than deriving at a policy weaker than the stored hash', async () => {
		// The account was hashed at r=8; a weaker current policy must refuse
		// rather than verify at the stored cost.
		const response = await signIn(db, signInEvent().event, { ...CHEAP, r: 4 });
		expect(response.status).toBe(401);
		expect(db.prepare('select count(*) as n from session').get()?.['n']).toBe(1);
	});

	it('answers with the account and the household it may read', async () => {
		const response = await signIn(db, signInEvent().event, CHEAP);
		expect(response.status).toBe(200);
		const body = await bodyOf(response);
		expect(body['account']).toMatchObject({ username: 'jordan' });
		expect(body['households']).toMatchObject([{ name: 'Flat 3', role: 'owner' }]);
	});

	it('issues a cookie that resolves to the account that signed in', async () => {
		const { event, written } = signInEvent();
		await signIn(db, event, CHEAP);
		expect(resolveSession(db, written[0]?.value ?? '')?.account.username).toBe('jordan');
	});

	it('hands the Android build a token and sets no cookie for it', async () => {
		const { event, written } = signInEvent(
			{},
			{ headers: { [SESSION_DELIVERY_HEADER]: 'bearer' } }
		);
		const body = await bodyOf(await signIn(db, event, CHEAP));
		expect(written).toHaveLength(0);
		expect(resolveSession(db, String(body['token']))?.account.username).toBe('jordan');
	});

	it('signs in under the name as it was typed, not only as it is stored', async () => {
		const response = await signIn(db, signInEvent({ username: 'JORDAN' }).event, CHEAP);
		expect(response.status).toBe(200);
	});

	it('refuses a wrong password', async () => {
		const response = await signIn(db, signInEvent({ password: 'not the password' }).event, CHEAP);
		expect(response.status).toBe(401);
		expect(await bodyOf(response)).toEqual({ error: { code: 'invalid-credentials' } });
	});

	it('starts no session for a wrong password', async () => {
		const before = db.prepare('select count(*) as n from session').get()?.['n'];
		const { event, written } = signInEvent({ password: 'not the password' });
		await signIn(db, event, CHEAP);
		expect(written).toHaveLength(0);
		expect(db.prepare('select count(*) as n from session').get()?.['n']).toBe(before);
	});

	it.each([
		['an unknown username', { username: 'nobody-here' }],
		['a wrong password', { password: 'not the password' }],
		['a username too short to exist', { username: 'no' }],
		['a password past the length any account has', { password: 'p'.repeat(200) }]
	])('says exactly the same thing about %s', async (_case, credentials) => {
		const response = await signIn(db, signInEvent(credentials).event, CHEAP);
		expect(response.status).toBe(401);
		expect(await bodyOf(response)).toEqual({ error: { code: 'invalid-credentials' } });
	});

	it('counts a failure against the account rather than forgetting it', async () => {
		await signIn(db, signInEvent({ password: 'not the password' }).event, CHEAP);
		expect(signInScopes()).toEqual(['address', 'username']);
	});

	it('refuses a locked attempt with 429 and says how long to wait', async () => {
		await failUntilLocked();
		const response = await signIn(db, signInEvent().event, CHEAP);
		expect(response.status).toBe(429);
		expect(await bodyOf(response)).toEqual({ error: { code: 'too-many-attempts' } });
		expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
	});

	it('refuses the correct password too while the lock holds', async () => {
		// A lock the right password walks through protects nothing: an attacker
		// guessing until it works would never notice.
		await failUntilLocked();
		const { event, written } = signInEvent();
		expect((await signIn(db, event, CHEAP)).status).toBe(429);
		expect(written).toHaveLength(0);
	});

	it('does not verify a password it has already refused to consider', async () => {
		await failUntilLocked();
		const before = db.prepare('select count(*) as n from session').get()?.['n'];
		await signIn(db, signInEvent().event, CHEAP);
		expect(db.prepare('select count(*) as n from session').get()?.['n']).toBe(before);
	});

	it('locks an unknown username on the same terms, so a lockout names nobody', async () => {
		for (let attempt = 0; attempt < 6; attempt += 1) {
			await signIn(db, signInEvent({ username: 'ghost-account' }).event, CHEAP);
		}
		const response = await signIn(db, signInEvent({ username: 'ghost-account' }).event, CHEAP);
		expect(response.status).toBe(429);
	});

	it('forgets the account failures once the password is proved', async () => {
		await signIn(db, signInEvent({ password: 'not the password' }).event, CHEAP);
		await signIn(db, signInEvent().event, CHEAP);
		expect(signInScopes()).toEqual(['address']);
	});

	it('keeps the address count, which one valid account must not reset', async () => {
		await signIn(db, signInEvent({ password: 'not the password' }).event, CHEAP);
		await signIn(db, signInEvent().event, CHEAP);
		expect(
			db.prepare("select failures from sign_in_throttle where scope = 'address'").get()?.[
				'failures'
			]
		).toBe(1);
	});

	it('skips the address scope when a proxy nobody declared rewrote the connection', async () => {
		const { event } = signInEvent(
			{ password: 'not the password' },
			{ headers: { 'x-forwarded-for': '203.0.113.9' } }
		);
		await signIn(db, event, CHEAP);
		expect(signInScopes()).toEqual(['username']);
	});

	it('records the device label the client named', async () => {
		await signIn(db, signInEvent({ deviceLabel: 'Pixel 7' }).event, CHEAP);
		const labels = db
			.prepare('select device_label from session')
			.all()
			.map((row) => row['device_label']);
		expect(labels).toContain('Pixel 7');
	});

	it('says how long to wait in whole seconds, and never in one', async () => {
		// The lock is the policy's first minute, so the wait is that, in whole
		// seconds -- not one, and not a thousand times too many.
		await failUntilLocked();
		const response = await signIn(db, signInEvent().event, CHEAP);
		const seconds = Number(response.headers.get('retry-after'));
		expect(seconds).toBeGreaterThan(50);
		expect(seconds).toBeLessThanOrEqual(60);
	});

	it('counts a sign-in with no username field against the empty name it becomes', async () => {
		// An absent username is the empty username, not a distinct identity with
		// its own allowance.
		for (let attempt = 0; attempt < 6; attempt += 1) {
			const { event } = eventFor({ path: '/api/sessions', body: { password: 'wrong entirely' } });
			await signIn(db, event, CHEAP);
		}
		expect((await signIn(db, signInEvent({ username: '' }).event, CHEAP)).status).toBe(429);
	});

	it('refuses a sign-in that carries no password field at all', async () => {
		const { event, written } = eventFor({
			path: '/api/sessions',
			body: { username: REGISTRATION.username }
		});
		const response = await signIn(db, event, CHEAP);
		expect(response.status).toBe(401);
		expect(written).toHaveLength(0);
	});

	it('refuses a body that is not JSON text fields', async () => {
		const { event } = eventFor({ path: '/api/sessions', body: { username: 7, password: 'x' } });
		expect((await signIn(db, event, CHEAP)).status).toBe(400);
	});

	it('refuses an oversize device label before it counts an attempt', async () => {
		const { event } = signInEvent({ deviceLabel: 'p'.repeat(101) });
		const response = await signIn(db, event, CHEAP);
		expect(await bodyOf(response)).toEqual({
			error: { code: 'invalid-input', field: 'deviceLabel', reason: 'too-long' }
		});
		expect(signInScopes()).toHaveLength(0);
	});
});

/** Sign in through the endpoint and hand back the token it issued. */
async function signedInToken(): Promise<string> {
	const { event, written } = signInEvent({}, { headers: { [SESSION_DELIVERY_HEADER]: 'bearer' } });
	const body = await bodyOf(await signIn(db, event, CHEAP));
	expect(written).toHaveLength(0);
	return String(body['token']);
}

function signOutEvent(token: string | undefined, carriedBy: 'cookie' | 'bearer'): Harness {
	return eventFor({
		path: '/api/sessions/current',
		...(carriedBy === 'cookie'
			? { ...(token === undefined ? {} : { cookie: token }) }
			: { headers: token === undefined ? {} : { authorization: `Bearer ${token}` } })
	});
}

describe('signOut', () => {
	beforeEach(registered);

	it('revokes the session the cookie presented', async () => {
		const token = await signedInToken();
		const { event } = signOutEvent(token, 'cookie');
		expect(signOut(db, event).status).toBe(204);
		expect(resolveSession(db, token)).toBeNull();
	});

	it('revokes the session the Android build presented as a bearer token', async () => {
		const token = await signedInToken();
		signOut(db, signOutEvent(token, 'bearer').event);
		expect(resolveSession(db, token)).toBeNull();
	});

	it('removes the cookie so the browser stops sending a token that is gone', async () => {
		const token = await signedInToken();
		const { event, removed } = signOutEvent(token, 'cookie');
		signOut(db, event);
		expect(removed).toEqual([SESSION_COOKIE]);
	});

	it('leaves the account and every other device alone', async () => {
		const kept = await signedInToken();
		const ending = await signedInToken();
		signOut(db, signOutEvent(ending, 'cookie').event);
		expect(resolveSession(db, kept)?.account.username).toBe('jordan');
		expect(db.prepare('select count(*) as n from account').get()?.['n']).toBe(1);
	});

	it('still clears the cookie of a session the server has already forgotten', async () => {
		const token = await signedInToken();
		signOut(db, signOutEvent(token, 'cookie').event);
		const { event, removed } = signOutEvent(token, 'cookie');
		expect(signOut(db, event).status).toBe(204);
		expect(removed).toEqual([SESSION_COOKIE]);
	});

	it('answers the same to a request carrying no credential at all', () => {
		const { event, removed } = signOutEvent(undefined, 'cookie');
		expect(signOut(db, event).status).toBe(204);
		expect(removed).toEqual([SESSION_COOKIE]);
	});

	it('says nothing about whether there was a session to end', async () => {
		const token = await signedInToken();
		const held = signOut(db, signOutEvent(token, 'cookie').event);
		const gone = signOut(db, signOutEvent(token, 'cookie').event);
		expect(gone.status).toBe(held.status);
		expect(await gone.text()).toBe(await held.text());
	});
});

describe('signOutEverywhere', () => {
	beforeEach(registered);

	it('revokes every session the account holds', async () => {
		const phone = await signedInToken();
		const laptop = await signedInToken();
		const auth = resolveSession(db, phone);
		const { event } = eventFor({ path: '/api/sessions' });
		event.locals.auth = auth;
		expect(signOutEverywhere(db, event).status).toBe(204);
		expect(resolveSession(db, phone)).toBeNull();
		expect(resolveSession(db, laptop)).toBeNull();
	});

	it('ends the session that asked, so a stolen phone is not a second request', async () => {
		const stolen = await signedInToken();
		const { event } = eventFor({ path: '/api/sessions' });
		event.locals.auth = resolveSession(db, stolen);
		signOutEverywhere(db, event);
		expect(db.prepare('select count(*) as n from session').get()?.['n']).toBe(0);
	});

	it('removes the cookie along with the rows behind it', async () => {
		const token = await signedInToken();
		const { event, removed } = eventFor({ path: '/api/sessions' });
		event.locals.auth = resolveSession(db, token);
		signOutEverywhere(db, event);
		expect(removed).toEqual([SESSION_COOKIE]);
	});

	it('leaves the account itself, and its household, in place', async () => {
		const token = await signedInToken();
		const { event } = eventFor({ path: '/api/sessions' });
		event.locals.auth = resolveSession(db, token);
		signOutEverywhere(db, event);
		expect(db.prepare('select count(*) as n from account').get()?.['n']).toBe(1);
		expect(db.prepare('select count(*) as n from household').get()?.['n']).toBe(1);
	});

	it('refuses an anonymous request, which names no account to act on', async () => {
		const { event, removed } = eventFor({ path: '/api/sessions' });
		const response = signOutEverywhere(db, event);
		expect(response.status).toBe(401);
		expect(await bodyOf(response)).toEqual({ error: { code: 'unauthenticated' } });
		expect(removed).toHaveLength(0);
	});

	it('revokes nothing when it refuses', async () => {
		const token = await signedInToken();
		signOutEverywhere(db, eventFor({ path: '/api/sessions' }).event);
		expect(resolveSession(db, token)?.account.username).toBe('jordan');
	});

	it('cannot be aimed at another account by the request body', async () => {
		const token = await signedInToken();
		const other = eventFor({ path: '/api/sessions', body: { accountId: 'someone-else' } });
		other.event.locals.auth = resolveSession(db, token);
		signOutEverywhere(db, other.event);
		expect(db.prepare('select count(*) as n from session').get()?.['n']).toBe(0);
	});
});

describe('currentSession', () => {
	beforeEach(registered);

	/** Sign in, then build the read the request hook would have resolved. */
	async function readingEvent(): Promise<Harness> {
		const token = await signedInToken();
		const harness = eventFor({ path: '/api/sessions/current' });
		harness.event.locals.auth = resolveSession(db, token);
		return harness;
	}

	it('answers the account, the households it may read, and the expiry', async () => {
		const { event } = await readingEvent();
		const response = currentSession(event);
		expect(response.status).toBe(200);
		const body = await bodyOf(response);
		expect(body['account']).toMatchObject({ username: 'jordan', displayName: 'Jordan' });
		expect(body['households']).toMatchObject([{ name: 'Flat 3', role: 'owner' }]);
		expect(body['expiresAt']).toStrictEqual(expect.any(String));
	});

	it('reports the expiry of the session the caller actually presented', async () => {
		const token = await signedInToken();
		const { event } = eventFor({ path: '/api/sessions/current' });
		const auth = resolveSession(db, token);
		event.locals.auth = auth;
		expect((await bodyOf(currentSession(event)))['expiresAt']).toBe(auth?.session.expiresAt);
	});

	it('answers those three fields and nothing else', async () => {
		// Returning more than the caller already owns is the leak, not the
		// credential it was asked about.
		const { event } = await readingEvent();
		expect(Object.keys(await bodyOf(currentSession(event))).sort()).toEqual([
			'account',
			'expiresAt',
			'households'
		]);
	});

	it('carries no token material, and no session row to replay', async () => {
		const token = await signedInToken();
		const { event } = eventFor({ path: '/api/sessions/current' });
		const auth = resolveSession(db, token);
		event.locals.auth = auth;
		const text = await currentSession(event).text();
		expect(text).not.toContain(token);
		expect(text).not.toContain(String(auth?.session.id));
		expect(text).not.toContain('token');
	});

	it('names no profile, and no other member of the household', async () => {
		const text = await currentSession((await readingEvent()).event).text();
		const profiles = db.prepare('select id from profile').all();
		expect(profiles).not.toHaveLength(0);
		for (const profile of profiles) expect(text).not.toContain(String(profile['id']));
	});

	it('shows one account nothing of another', async () => {
		await register(db, eventFor({ body: { ...REGISTRATION, username: 'sam' } }).event, CHEAP);
		const text = await currentSession((await readingEvent()).event).text();
		expect(text).not.toContain('sam');
		expect(text).not.toContain(
			String(db.prepare("select id from account where username = 'sam'").get()?.['id'])
		);
	});

	it('sets no cookie and starts no session of its own', async () => {
		const { event, written } = await readingEvent();
		const before = db.prepare('select count(*) as n from session').get()?.['n'];
		currentSession(event);
		expect(written).toHaveLength(0);
		expect(db.prepare('select count(*) as n from session').get()?.['n']).toBe(before);
	});

	it('refuses a request that carries no session', async () => {
		const { event } = eventFor({ path: '/api/sessions/current' });
		const response = currentSession(event);
		expect(response.status).toBe(401);
		expect(await bodyOf(response)).toEqual({ error: { code: 'unauthenticated' } });
	});

	it('cannot be aimed at another account by the request body', async () => {
		const other = eventFor({ path: '/api/sessions/current', body: { accountId: 'someone-else' } });
		other.event.locals.auth = (await readingEvent()).event.locals.auth;
		const body = await bodyOf(currentSession(other.event));
		expect(body['account']).toMatchObject({ username: 'jordan' });
	});
});
