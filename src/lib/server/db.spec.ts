import { chmodSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDatabase, migrate, openDatabase } from './db';

const temporaryDirectories: string[] = [];

function temporaryPath(name: string) {
	const directory = mkdtempSync(join(tmpdir(), 'fit-db-'));
	temporaryDirectories.push(directory);
	return join(directory, name);
}

function tableNames(db: DatabaseSync) {
	return db
		.prepare("select name from sqlite_master where type = 'table' order by name")
		.all()
		.map((row) => row['name']);
}

function userVersion(db: DatabaseSync) {
	return db.prepare('pragma user_version').get()?.['user_version'];
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe('migrate', () => {
	it('creates every table the users module needs', () => {
		const db = new DatabaseSync(':memory:');
		migrate(db);
		expect(tableNames(db)).toEqual(
			expect.arrayContaining(['account', 'household', 'membership', 'profile', 'session'])
		);
	});

	it('records the applied version in the database itself', () => {
		const db = new DatabaseSync(':memory:');
		expect(migrate(db)).toBe(userVersion(db));
	});

	it('is a no-op on a database that is already current', () => {
		const db = new DatabaseSync(':memory:');
		const first = migrate(db);
		// A second run that re-applied migration 1 would fail on `create table`.
		expect(migrate(db)).toBe(first);
	});

	it('refuses a database from a newer server rather than guessing at its schema', () => {
		const db = new DatabaseSync(':memory:');
		migrate(db);
		db.exec('pragma user_version = 99');
		expect(() => migrate(db)).toThrow('newer than this server supports');
	});

	it('rolls back a migration that cannot be applied', () => {
		const db = new DatabaseSync(':memory:');
		db.exec('create table account (id text primary key) strict');
		expect(() => migrate(db)).toThrow();
		expect(tableNames(db)).not.toContain('household');
		expect(userVersion(db)).toBe(0);
	});
});

describe('openDatabase', () => {
	it('creates the directory the database file lives in', () => {
		const path = temporaryPath('nested/deeper/app.sqlite');
		const db = openDatabase(path);
		expect(tableNames(db)).toContain('account');
		db.close();
	});

	it.skipIf(process.platform === 'win32')(
		'keeps the database directory, file, and live SQLite sidecars private',
		() => {
			const path = temporaryPath('private/app.sqlite');
			const directory = dirname(path);
			const db = openDatabase(path);
			db.prepare('insert into household (id, name, created_at) values (?, ?, ?)').run(
				'h1',
				'Home',
				'2026-08-29T00:00:00.000Z'
			);

			expect(statSync(directory).mode & 0o777).toBe(0o700);
			expect(statSync(path).mode & 0o777).toBe(0o600);
			for (const sidecar of [`${path}-wal`, `${path}-shm`]) {
				expect(existsSync(sidecar)).toBe(true);
				expect(statSync(sidecar).mode & 0o777).toBe(0o600);
			}
			db.close();
		}
	);

	it.skipIf(process.platform === 'win32')(
		'refuses an existing public directory without changing its permissions',
		() => {
			const path = temporaryPath('app.sqlite');
			const directory = dirname(path);
			chmodSync(directory, 0o755);
			expect(() => openDatabase(path)).toThrow('database directory must be private');
			expect(statSync(directory).mode & 0o777).toBe(0o755);
		}
	);

	it.skipIf(process.platform === 'win32')(
		'hardens existing sidecars and closes a connection when migration fails',
		() => {
			const path = temporaryPath('app.sqlite');
			const raw = new DatabaseSync(path);
			raw.exec('pragma journal_mode = wal');
			raw.exec('create table future_data (value text) strict');
			raw.exec('pragma user_version = 99');
			for (const candidate of [path, `${path}-wal`, `${path}-shm`]) chmodSync(candidate, 0o666);
			const close = vi.spyOn(DatabaseSync.prototype, 'close');

			expect(() => openDatabase(path)).toThrow('newer than this server supports');
			expect(close).toHaveBeenCalledTimes(1);
			for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
				expect(statSync(candidate).mode & 0o777).toBe(0o600);
			}
			close.mockRestore();
			raw.close();
		}
	);

	it('enforces foreign keys, which SQLite leaves off by default', () => {
		const db = openDatabase(':memory:');
		expect(() =>
			db
				.prepare(
					'insert into membership (household_id, account_id, role, created_at) values (?, ?, ?, ?)'
				)
				.run('no-such-household', 'no-such-account', 'owner', '2026-08-29T00:00:00.000Z')
		).toThrow();
	});

	it('rejects a membership role outside the two the schema allows', () => {
		const db = openDatabase(':memory:');
		db.prepare('insert into household (id, name, created_at) values (?, ?, ?)').run(
			'h1',
			'Home',
			'2026-08-29T00:00:00.000Z'
		);
		db.prepare(
			`insert into account (id, username, display_name, password_hash, created_at, updated_at)
			 values (?, ?, ?, ?, ?, ?)`
		).run('a1', 'jordan', 'Jordan', 'x', '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z');
		expect(() =>
			db
				.prepare(
					'insert into membership (household_id, account_id, role, created_at) values (?, ?, ?, ?)'
				)
				.run('h1', 'a1', 'administrator', '2026-08-29T00:00:00.000Z')
		).toThrow();
	});

	it('rejects linking an account to a profile outside its household membership', () => {
		const db = openDatabase(':memory:');
		const stamp = '2026-08-29T00:00:00.000Z';
		for (const [householdId, accountId, username] of [
			['h1', 'a1', 'jordan'] as const,
			['h2', 'a2', 'alex'] as const
		]) {
			db.prepare('insert into household (id, name, created_at) values (?, ?, ?)').run(
				householdId,
				`${username} home`,
				stamp
			);
			db.prepare(
				`insert into account (id, username, display_name, password_hash, created_at, updated_at)
				 values (?, ?, ?, ?, ?, ?)`
			).run(accountId, username, username, 'hash', stamp, stamp);
			db.prepare(
				'insert into membership (household_id, account_id, role, created_at) values (?, ?, ?, ?)'
			).run(householdId, accountId, 'owner', stamp);
		}

		expect(() =>
			db
				.prepare(
					'insert into profile (id, household_id, account_id, name, created_at) values (?, ?, ?, ?, ?)'
				)
				.run('p1', 'h1', 'a2', 'Alex', stamp)
		).toThrow();
	});

	it('allows a profile without an account in its household', () => {
		const db = openDatabase(':memory:');
		const stamp = '2026-08-29T00:00:00.000Z';
		db.prepare('insert into household (id, name, created_at) values (?, ?, ?)').run(
			'h1',
			'Home',
			stamp
		);
		db.prepare(
			'insert into profile (id, household_id, account_id, name, created_at) values (?, ?, ?, ?, ?)'
		).run('p1', 'h1', null, 'Child', stamp);
		expect(
			db.prepare('select account_id from profile where id = ?').get('p1')?.['account_id']
		).toBeNull();
	});

	it('keeps a profile but unlinks its account when that account is deleted', () => {
		const db = openDatabase(':memory:');
		const stamp = '2026-08-29T00:00:00.000Z';
		db.prepare('insert into household (id, name, created_at) values (?, ?, ?)').run(
			'h1',
			'Home',
			stamp
		);
		db.prepare(
			`insert into account (id, username, display_name, password_hash, created_at, updated_at)
			 values (?, ?, ?, ?, ?, ?)`
		).run('a1', 'jordan', 'Jordan', 'hash', stamp, stamp);
		db.prepare(
			'insert into membership (household_id, account_id, role, created_at) values (?, ?, ?, ?)'
		).run('h1', 'a1', 'owner', stamp);
		db.prepare(
			'insert into profile (id, household_id, account_id, name, created_at) values (?, ?, ?, ?, ?)'
		).run('p1', 'h1', 'a1', 'Jordan', stamp);

		db.prepare('delete from account where id = ?').run('a1');
		expect(
			db.prepare('select account_id from profile where id = ?').get('p1')?.['account_id']
		).toBeNull();
	});

	it('allows only one signed-in profile per membership', () => {
		const db = openDatabase(':memory:');
		const stamp = '2026-08-29T00:00:00.000Z';
		db.prepare('insert into household (id, name, created_at) values (?, ?, ?)').run(
			'h1',
			'Home',
			stamp
		);
		db.prepare(
			`insert into account (id, username, display_name, password_hash, created_at, updated_at)
			 values (?, ?, ?, ?, ?, ?)`
		).run('a1', 'jordan', 'Jordan', 'hash', stamp, stamp);
		db.prepare(
			'insert into membership (household_id, account_id, role, created_at) values (?, ?, ?, ?)'
		).run('h1', 'a1', 'owner', stamp);
		db.prepare(
			'insert into profile (id, household_id, account_id, name, created_at) values (?, ?, ?, ?, ?)'
		).run('p1', 'h1', 'a1', 'Jordan', stamp);

		expect(() =>
			db
				.prepare(
					'insert into profile (id, household_id, account_id, name, created_at) values (?, ?, ?, ?, ?)'
				)
				.run('p2', 'h1', 'a1', 'Jordan again', stamp)
		).toThrow();
	});

	it('preserves and unlinks a profile when its membership is removed', () => {
		const db = openDatabase(':memory:');
		const stamp = '2026-08-29T00:00:00.000Z';
		db.prepare('insert into household (id, name, created_at) values (?, ?, ?)').run(
			'h1',
			'Home',
			stamp
		);
		db.prepare(
			`insert into account (id, username, display_name, password_hash, created_at, updated_at)
			 values (?, ?, ?, ?, ?, ?)`
		).run('a1', 'jordan', 'Jordan', 'hash', stamp, stamp);
		db.prepare(
			'insert into membership (household_id, account_id, role, created_at) values (?, ?, ?, ?)'
		).run('h1', 'a1', 'owner', stamp);
		db.prepare(
			'insert into profile (id, household_id, account_id, name, created_at) values (?, ?, ?, ?, ?)'
		).run('p1', 'h1', 'a1', 'Jordan', stamp);

		db.prepare('delete from membership where household_id = ? and account_id = ?').run('h1', 'a1');
		expect(
			db.prepare('select household_id, account_id from profile where id = ?').get('p1')
		).toEqual({ household_id: 'h1', account_id: null });
	});
});

describe('getDatabase', () => {
	it('owns one lazily opened application connection', () => {
		const path = temporaryPath('runtime/app.sqlite');
		const previousPath = process.env['FIT_DB_PATH'];
		process.env['FIT_DB_PATH'] = path;
		try {
			const first = getDatabase();
			expect(getDatabase()).toBe(first);
			expect(tableNames(first)).toContain('account');
			first.close();
		} finally {
			if (previousPath === undefined) delete process.env['FIT_DB_PATH'];
			else process.env['FIT_DB_PATH'] = previousPath;
		}
	});
});
