import { scryptSync } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db';
import { authenticate, membershipsFor, registerAccount } from './accounts';
import type { Registration } from './accounts';
import { hashPassword } from './password';

/** See the note in `password.spec.ts`: the production cost is too slow to test at. */
const CHEAP = { n: 2 ** 12, r: 8, p: 1 };

const PASSWORD = 'correct horse battery staple';

function legacyHash(password: string): string {
	const salt = Buffer.alloc(16, 7);
	const key = scryptSync(password, salt, 32, {
		N: CHEAP.n,
		r: CHEAP.r,
		p: CHEAP.p,
		maxmem: 512 * 1024 * 1024
	});
	return `scrypt$${CHEAP.n}$${CHEAP.r}$${CHEAP.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

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

/**
 * Each case opens its own database; close it. Under a mutation run, hundreds of
 * live `node:sqlite` handles crash the worker, which Stryker records as a timeout.
 */
afterEach(() => {
	db.close();
});

async function register(overrides: Partial<Registration> = {}) {
	const result = await registerAccount(db, { ...DEFAULTS, ...overrides }, CHEAP);
	if (!result.ok) throw new Error(`registration failed: ${JSON.stringify(result.problem)}`);
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

	it('falls back to the display name when the household name is only whitespace', async () => {
		await register({ householdName: '   ' });
		expect(db.prepare('select name from household').get()?.['name']).toBe('Jordan');
	});

	it('reports an unusable username', async () => {
		const result = await registerAccount(db, { ...DEFAULTS, username: 'jo' }, CHEAP);
		expect(result).toEqual({
			ok: false,
			problem: { field: 'username', code: 'too-short' }
		});
	});

	it('reports an unusable password', async () => {
		const result = await registerAccount(db, { ...DEFAULTS, password: 'short' }, CHEAP);
		expect(result).toEqual({
			ok: false,
			problem: { field: 'password', code: 'too-short' }
		});
	});

	it('rejects an oversized display name before creating any rows', async () => {
		const result = await registerAccount(db, { ...DEFAULTS, displayName: 'x'.repeat(101) }, CHEAP);
		expect(result).toEqual({
			ok: false,
			problem: { field: 'displayName', code: 'too-long' }
		});
		expect([countOf('account'), countOf('household')]).toEqual([0, 0]);
	});

	it('rejects an oversized household name before creating any rows', async () => {
		const result = await registerAccount(
			db,
			{ ...DEFAULTS, householdName: 'x'.repeat(101) },
			CHEAP
		);
		expect(result).toEqual({
			ok: false,
			problem: { field: 'householdName', code: 'too-long' }
		});
		expect([countOf('account'), countOf('household')]).toEqual([0, 0]);
	});

	it.each([
		['displayName', { displayName: 'Jordan\u202EliE' }],
		['householdName', { householdName: 'Flat\n3' }]
	] as const)('identifies unsafe characters in %s', async (field, overrides) => {
		const result = await registerAccount(db, { ...DEFAULTS, ...overrides }, CHEAP);
		expect(result).toEqual({
			ok: false,
			problem: { field, code: 'unsafe-characters' }
		});
		expect([countOf('account'), countOf('household')]).toEqual([0, 0]);
	});

	it('reports a username already taken', async () => {
		await register();
		const result = await registerAccount(db, DEFAULTS, CHEAP);
		expect(result).toEqual({ ok: false, problem: { field: 'username', code: 'taken' } });
	});

	it('treats a differently-cased duplicate as taken', async () => {
		await register();
		const result = await registerAccount(db, { ...DEFAULTS, username: 'JORDAN' }, CHEAP);
		expect(result).toEqual({ ok: false, problem: { field: 'username', code: 'taken' } });
	});

	it('writes nothing at all when the username is taken', async () => {
		await register();
		await registerAccount(db, DEFAULTS, CHEAP);
		expect([countOf('account'), countOf('household')]).toEqual([1, 1]);
	});

	it('rolls back a duplicate attempt so the connection remains usable', async () => {
		await register();
		await registerAccount(db, DEFAULTS, CHEAP);
		await expect(register({ username: 'alex' })).resolves.toMatchObject({ username: 'alex' });
	});

	it('does not classify a foreign-realm error as SQLite solely from its numeric property', async () => {
		const failing = {
			exec: () => undefined,
			prepare: () => ({
				run: () => {
					runInNewContext(`throw Object.assign(new Error('foreign error'), { errcode: 2067 })`);
				}
			})
		} as unknown as DatabaseSync;
		await expect(registerAccount(failing, DEFAULTS, CHEAP)).rejects.toMatchObject({
			message: 'foreign error',
			errcode: 2067
		});
	});

	it('does not swallow a failure that is not a duplicate username', async () => {
		db.exec('drop table profile');
		await expect(registerAccount(db, DEFAULTS, CHEAP)).rejects.toThrow();
	});
});

describe('authenticate', () => {
	it('returns the account for the right password', async () => {
		const account = await register();
		expect(await authenticate(db, 'jordan', PASSWORD, { cost: CHEAP })).toEqual(account);
	});

	it('accepts the username in any case', async () => {
		const account = await register();
		expect(await authenticate(db, 'JORDAN', PASSWORD, { cost: CHEAP })).toEqual(account);
	});

	it('refuses the wrong password', async () => {
		await register();
		expect(await authenticate(db, 'jordan', 'incorrect horse battery', { cost: CHEAP })).toBeNull();
	});

	it('refuses an unknown username', async () => {
		await register();
		expect(await authenticate(db, 'alex', PASSWORD, { cost: CHEAP })).toBeNull();
	});

	it('rejects raw oversized credentials before normalizing or deriving', async () => {
		await register();
		expect(await authenticate(db, 'j'.repeat(129), PASSWORD, { cost: CHEAP })).toBeNull();
		expect(await authenticate(db, 'jordan', 'x'.repeat(129), { cost: CHEAP })).toBeNull();
	});

	it('does not query the database for either independently invalid credential', async () => {
		const unopened = {
			prepare: () => {
				throw new Error('database must remain untouched');
			}
		} as unknown as DatabaseSync;
		await expect(
			authenticate(unopened, `${' '.repeat(126)}abc`, PASSWORD, { cost: CHEAP })
		).resolves.toBeNull();
		await expect(
			authenticate(unopened, 'jordan', 'x'.repeat(129), { cost: CHEAP })
		).resolves.toBeNull();
	});

	it('accepts a password exactly at the bounded KDF input limit', async () => {
		const password = 'x'.repeat(128);
		const account = await register({ password });
		expect(await authenticate(db, 'jordan', password, { cost: CHEAP })).toEqual(account);
	});

	it('upgrades an older password hash after successful authentication', async () => {
		const account = await register();
		const before = db.prepare('select password_hash from account where id = ?').get(account.id)?.[
			'password_hash'
		];
		const upgradedCost = { n: 2 ** 13, r: 8, p: 1 };
		const upgradedAt = new Date('2026-08-29T12:00:00.000Z');

		expect(
			await authenticate(db, 'jordan', PASSWORD, { cost: upgradedCost, now: upgradedAt })
		).toEqual(account);
		const stored = db
			.prepare('select password_hash, updated_at from account where id = ?')
			.get(account.id);
		expect(stored?.['password_hash']).not.toBe(before);
		expect(String(stored?.['password_hash']).split('$').slice(1, 4)).toEqual(['8192', '8', '1']);
		expect(stored?.['updated_at']).toBe(upgradedAt.toISOString());
	});

	it('does not upgrade a hash when authentication fails', async () => {
		const account = await register();
		const before = db.prepare('select password_hash from account where id = ?').get(account.id)?.[
			'password_hash'
		];
		expect(
			await authenticate(db, 'jordan', 'incorrect horse battery', {
				cost: { n: 2 ** 13, r: 8, p: 1 }
			})
		).toBeNull();
		expect(
			db.prepare('select password_hash from account where id = ?').get(account.id)?.[
				'password_hash'
			]
		).toBe(before);
	});

	it('fails closed on stronger or incomparable stored policies', async () => {
		const account = await register();
		const target = { ...CHEAP, n: 2 ** 13 };
		for (const storedCost of [
			{ ...target, n: 2 ** 14 },
			{ ...CHEAP, r: 16 }
		]) {
			const storedHash = await hashPassword(PASSWORD, storedCost);
			db.prepare('update account set password_hash = ? where id = ?').run(storedHash, account.id);
			expect(await authenticate(db, 'jordan', PASSWORD, { cost: target })).toBeNull();
			expect(
				db.prepare('select password_hash from account where id = ?').get(account.id)?.[
					'password_hash'
				]
			).toBe(storedHash);
		}
	});

	it('does not replace a verified short legacy password with the timing-padding hash', async () => {
		const account = await register();
		const shortPassword = 'short';
		const storedHash = legacyHash(shortPassword);
		db.prepare('update account set password_hash = ? where id = ?').run(storedHash, account.id);

		expect(
			await authenticate(db, 'jordan', shortPassword, { cost: { ...CHEAP, n: 2 ** 13 } })
		).toEqual(account);
		expect(
			db.prepare('select password_hash from account where id = ?').get(account.id)?.[
				'password_hash'
			]
		).toBe(storedHash);
		expect(
			await authenticate(db, 'jordan', shortPassword, { cost: { ...CHEAP, n: 2 ** 13 } })
		).toEqual(account);
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
