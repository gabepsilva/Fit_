import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase, transaction } from './db';

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

	it('leaves a version from the future alone rather than winding it back', () => {
		const db = new DatabaseSync(':memory:');
		migrate(db);
		db.exec('pragma user_version = 99');
		expect(migrate(db)).toBe(99);
	});
});

describe('transaction', () => {
	it('commits the work when it returns', () => {
		const db = new DatabaseSync(':memory:');
		db.exec('create table t (a text) strict');
		const returned = transaction(db, () => {
			db.prepare('insert into t (a) values (?)').run('kept');
			return 'result';
		});
		expect([returned, db.prepare('select count(*) as n from t').get()?.['n']]).toEqual([
			'result',
			1
		]);
	});

	it('rolls the work back and rethrows when it does not', () => {
		const db = new DatabaseSync(':memory:');
		db.exec('create table t (a text) strict');
		expect(() =>
			transaction(db, () => {
				db.prepare('insert into t (a) values (?)').run('discarded');
				throw new Error('nope');
			})
		).toThrow('nope');
		expect(db.prepare('select count(*) as n from t').get()?.['n']).toBe(0);
	});
});

describe('openDatabase', () => {
	it('creates the directory the database file lives in', () => {
		const path = temporaryPath('nested/deeper/app.sqlite');
		const db = openDatabase(path);
		expect(tableNames(db)).toContain('account');
		db.close();
	});

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
});
