import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Schema versions, oldest first. The count of applied entries is kept in
 * SQLite's own `user_version`, so a database only ever runs what it has not
 * seen. Append to this list; never edit a shipped entry, because every database
 * that already ran it will skip the edit.
 *
 * `household_id` sits on every table that will ever hold a member's data, from
 * the first version, even though today one account means one household. Adding
 * a tenancy column to a table that already holds live health records is the
 * migration this column exists to avoid.
 */
const MIGRATIONS = [
	`
	create table account (
		id            text primary key,
		username      text not null unique,
		display_name  text not null,
		-- Nullable on purpose rather than absent: sign-up asks for a username and
		-- nothing else today, and there is no verification flow. Carrying the
		-- column from the start makes adding email later a feature rather than a
		-- migration over a table full of credentials.
		email         text,
		password_hash text not null,
		-- Hash of the one-time recovery code. With no email there is no reset
		-- link, so this is the only thing standing between a forgotten password
		-- and a lost account.
		recovery_hash text,
		created_at    text not null,
		updated_at    text not null
	) strict;

	create table household (
		id         text primary key,
		name       text not null,
		created_at text not null
	) strict;

	create table membership (
		household_id text not null references household (id) on delete cascade,
		account_id   text not null references account (id) on delete cascade,
		role         text not null check (role in ('owner', 'member')),
		created_at   text not null,
		primary key (household_id, account_id)
	) strict;

	create table profile (
		id           text primary key,
		household_id text not null references household (id) on delete cascade,
		-- Null for the people who are tracked but never sign in: a partner, a
		-- child. This column is the entire reason account and profile are two
		-- tables rather than one.
		account_id   text references account (id) on delete set null,
		name         text not null,
		created_at   text not null
	) strict;

	create index profile_by_household on profile (household_id);

	create table session (
		id           text primary key,
		account_id   text not null references account (id) on delete cascade,
		token_hash   text not null unique,
		device_label text,
		created_at   text not null,
		last_seen_at text not null,
		expires_at   text not null
	) strict;

	create index session_by_account on session (account_id);
	`
];

/**
 * Run `work` inside one SQLite transaction. Anything thrown rolls the whole
 * thing back, so a half-registered account cannot survive a failure partway
 * through the four rows it takes to create one.
 */
export function transaction<T>(db: DatabaseSync, work: () => T): T {
	db.exec('begin');
	try {
		const result = work();
		db.exec('commit');
		return result;
	} catch (error) {
		db.exec('rollback');
		throw error;
	}
}

/** Apply every migration the database has not run yet, and report the version. */
export function migrate(db: DatabaseSync): number {
	const row = db.prepare('pragma user_version').get();
	const stored = row?.['user_version'];
	const applied = typeof stored === 'number' ? stored : 0;
	for (const [index, sql] of MIGRATIONS.entries()) {
		if (index < applied) continue;
		transaction(db, () => {
			db.exec(sql);
			// `pragma` accepts no bound parameters. The value is an index into a
			// literal array in this file, so no caller can reach it.
			db.exec(`pragma user_version = ${index + 1}`);
		});
	}
	return Math.max(applied, MIGRATIONS.length);
}

/**
 * Open the application database and bring its schema up to date.
 *
 * This is deliberately not the food database. `data/db/fit-food-full.sqlite` is
 * regenerated wholesale by the ETL pipeline, so user rows kept in it would be
 * destroyed by the next rebuild.
 */
export function openDatabase(path: string): DatabaseSync {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	// SQLite defaults foreign keys off, and the setting is ignored inside a
	// transaction — so it has to happen here, before the first migration runs.
	db.exec('pragma foreign_keys = on');
	db.exec('pragma journal_mode = wal');
	// Wait rather than fail when another connection holds the write lock.
	db.exec('pragma busy_timeout = 5000');
	migrate(db);
	return db;
}
