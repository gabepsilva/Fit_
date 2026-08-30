import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { register, SESSION_DELIVERY_HEADER, signIn } from './auth-endpoints';
import type { AuthEvent } from './auth-endpoints';
import { openDatabase } from './db';
import { SESSION_COOKIE } from './session-cookie';
import { resolveSession } from './users/sessions';

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
});

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

/** Fail enough times to trip the username scope, which locks on the sixth. */
async function failUntilLocked(): Promise<void> {
	for (let attempt = 0; attempt < 6; attempt += 1) {
		await signIn(db, signInEvent({ password: 'wrong password entirely' }).event, CHEAP);
	}
}

describe('signIn', () => {
	beforeEach(registered);

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
		expect(db.prepare('select count(*) as n from sign_in_throttle').get()?.['n']).toBe(2);
	});

	it('refuses a locked attempt with 429 and says how long to wait', async () => {
		await failUntilLocked();
		const response = await signIn(db, signInEvent().event, CHEAP);
		expect(response.status).toBe(429);
		expect(await bodyOf(response)).toEqual({ error: { code: 'too-many-attempts' } });
		expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
	});

	it('refuses the correct password too while the lock holds', async () => {
		// A lock that the right password walks through protects nothing: an
		// attacker guessing until it works never notices it.
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
		const scopes = db.prepare('select scope from sign_in_throttle').all();
		expect(scopes.map((row) => row['scope'])).toEqual(['address']);
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
		const scopes = db.prepare('select scope from sign_in_throttle').all();
		expect(scopes.map((row) => row['scope'])).toEqual(['username']);
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
		expect(db.prepare('select count(*) as n from sign_in_throttle').get()?.['n']).toBe(0);
	});
});
