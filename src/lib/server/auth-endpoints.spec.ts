import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { register, SESSION_DELIVERY_HEADER } from './auth-endpoints';
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
