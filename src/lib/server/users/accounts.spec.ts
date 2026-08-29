import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db';
import { authenticate, membershipsFor, registerAccount } from './accounts';
import type { Registration } from './accounts';

/** See the note in `password.spec.ts`: the production cost is too slow to test at. */
const CHEAP = { n: 2 ** 12, r: 8, p: 1 };

const PASSWORD = 'correct horse battery staple';

const DEFAULTS: Registration = {
	username: 'jordan',
	displayName: 'Jordan',
	password: PASSWORD,
	householdName: 'Flat 3'
};

let db: DatabaseSync;

beforeEach(() => {
	db = openDatabase(':memory:');
});

async function register(overrides: Partial<Registration> = {}) {
	const result = await registerAccount(db, { ...DEFAULTS, ...overrides }, CHEAP);
	if (!result.ok) throw new Error(`registration failed: ${result.problem}`);
	return result.account;
}

function countOf(table: string) {
	return db.prepare(`select count(*) as n from ${table}`).get()?.['n'];
}

describe('registerAccount', () => {
	it('returns the new account without its password hash', async () => {
		const account = await register();
		expect(Object.keys(account).sort()).toEqual(['createdAt', 'displayName', 'id', 'username']);
	});

	it('creates the household, the membership and the profile alongside the account', async () => {
		await register();
		expect([
			countOf('account'),
			countOf('household'),
			countOf('membership'),
			countOf('profile')
		]).toEqual([1, 1, 1, 1]);
	});

	it('makes the first account the owner of its household', async () => {
		const account = await register();
		expect(membershipsFor(db, account.id)).toMatchObject([{ name: 'Flat 3', role: 'owner' }]);
	});

	it('reports the household id the request will filter every later read on', async () => {
		const account = await register();
		const stored = db.prepare('select id from household').get()?.['id'];
		expect(membershipsFor(db, account.id)[0]?.householdId).toBe(stored);
	});

	it('links the account to a profile, which is what lets un-signed-in people be tracked', async () => {
		const account = await register();
		expect(db.prepare('select account_id from profile').get()?.['account_id']).toBe(account.id);
	});

	it('stores the normalized username, not what was typed', async () => {
		const account = await register({ username: '  Jordan  ' });
		expect(account.username).toBe('jordan');
	});

	it('never stores the password itself', async () => {
		await register();
		const stored = db.prepare('select password_hash from account').get()?.['password_hash'];
		expect(stored).not.toContain(PASSWORD);
	});

	it('falls back to the username when no display name is given', async () => {
		const account = await register({ displayName: '   ' });
		expect(account.displayName).toBe('jordan');
	});

	it('falls back to the display name when no household name is given', async () => {
		await register({ householdName: '' });
		expect(db.prepare('select name from household').get()?.['name']).toBe('Jordan');
	});

	it('reports an unusable username', async () => {
		const result = await registerAccount(db, { ...DEFAULTS, username: 'jo' }, CHEAP);
		expect(result).toEqual({ ok: false, problem: 'too-short' });
	});

	it('reports an unusable password', async () => {
		const result = await registerAccount(db, { ...DEFAULTS, password: 'short' }, CHEAP);
		expect(result).toEqual({ ok: false, problem: 'too-short' });
	});

	it('reports a username already taken', async () => {
		await register();
		const result = await registerAccount(db, DEFAULTS, CHEAP);
		expect(result).toEqual({ ok: false, problem: 'username-taken' });
	});

	it('treats a differently-cased duplicate as taken', async () => {
		await register();
		const result = await registerAccount(db, { ...DEFAULTS, username: 'JORDAN' }, CHEAP);
		expect(result).toEqual({ ok: false, problem: 'username-taken' });
	});

	it('writes nothing at all when the username is taken', async () => {
		await register();
		await registerAccount(db, DEFAULTS, CHEAP);
		expect([countOf('account'), countOf('household')]).toEqual([1, 1]);
	});

	it('does not swallow a failure that is not a duplicate username', async () => {
		db.exec('drop table profile');
		await expect(registerAccount(db, DEFAULTS, CHEAP)).rejects.toThrow();
	});
});

describe('authenticate', () => {
	it('returns the account for the right password', async () => {
		const account = await register();
		expect(await authenticate(db, 'jordan', PASSWORD, CHEAP)).toEqual(account);
	});

	it('accepts the username in any case', async () => {
		const account = await register();
		expect(await authenticate(db, 'JORDAN', PASSWORD, CHEAP)).toEqual(account);
	});

	it('refuses the wrong password', async () => {
		await register();
		expect(await authenticate(db, 'jordan', 'incorrect horse battery', CHEAP)).toBeNull();
	});

	it('refuses an unknown username', async () => {
		await register();
		expect(await authenticate(db, 'alex', PASSWORD, CHEAP)).toBeNull();
	});
});

describe('membershipsFor', () => {
	it('is empty for an account in no household', async () => {
		await register();
		expect(membershipsFor(db, 'no-such-account')).toEqual([]);
	});

	it('reads a role the schema allows but registration does not create', async () => {
		const owner = await register();
		const guest = await register({ username: 'alex', displayName: 'Alex' });
		const householdId = membershipsFor(db, owner.id)[0]?.householdId ?? '';
		db.prepare(
			'insert into membership (household_id, account_id, role, created_at) values (?, ?, ?, ?)'
		).run(householdId, guest.id, 'member', '2026-08-29T00:00:00.000Z');
		expect(
			membershipsFor(db, guest.id)
				.map((m) => m.role)
				.sort()
		).toEqual(['member', 'owner']);
	});
});
