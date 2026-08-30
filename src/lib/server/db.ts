import { chmodSync, closeSync, existsSync, mkdirSync, openSync, statSync } from 'node:fs';
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
		created_at   text not null,
		-- A signed-in profile belongs to a membership, not merely to an account
		-- and an unrelated household that each happen to exist.
		foreign key (household_id, account_id)
			references membership (household_id, account_id),
		unique (household_id, account_id)
	) strict;

	create index profile_by_household on profile (household_id);

	-- Removing login access does not delete the person or their health history.
	-- Unlink the profile before the composite membership foreign key is checked.
	create trigger membership_unlink_profile_before_delete
	before delete on membership
	begin
		update profile
		set account_id = null
		where household_id = old.household_id and account_id = old.account_id;
	end;

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
	`,
	`
	-- Failed sign-in attempts, counted per scope. Rows here are written for
	-- unauthenticated input, so they hold no attacker-supplied text and never
	-- reference the account table: the count exists whether or not the username
	-- does, which is what keeps a lockout from answering "does this person exist".
	create table sign_in_throttle (
		scope          text not null check (scope in ('username', 'address')),
		key_hash       text not null,
		failures       integer not null,
		window_ends_at text not null,
		locked_until   text,
		primary key (scope, key_hash)
	) strict;

	create index sign_in_throttle_expiry on sign_in_throttle (window_ends_at);
	`,
	`
	-- Registration is throttled in the same table, in a scope of its own, so the
	-- one place that answers "this username exists" is not also the cheapest way
	-- to ask. SQLite cannot widen a check constraint in place, so the table is
	-- rebuilt around it; the rows are carried over rather than dropped, because
	-- discarding them would hand every locked-out caller a reset on deploy.
	create table sign_in_throttle_next (
		scope          text not null check (scope in ('username', 'address', 'registration')),
		key_hash       text not null,
		failures       integer not null,
		window_ends_at text not null,
		locked_until   text,
		primary key (scope, key_hash)
	) strict;

	insert into sign_in_throttle_next (scope, key_hash, failures, window_ends_at, locked_until)
	select scope, key_hash, failures, window_ends_at, locked_until from sign_in_throttle;

	drop table sign_in_throttle;

	alter table sign_in_throttle_next rename to sign_in_throttle;

	-- The index went with the table it was on.
	create index sign_in_throttle_expiry on sign_in_throttle (window_ends_at);
	`
];

/** Apply every migration the database has not run yet, and report the version. */
export function migrate(db: DatabaseSync): number {
	// SQLite guarantees one numeric row for this pragma.
	const row = db.prepare('pragma user_version').get() as { user_version: number };
	const applied = row.user_version;
	if (applied > MIGRATIONS.length) {
		throw new Error(
			`database schema version ${applied} is newer than this server supports (${MIGRATIONS.length})`
		);
	}
	for (const [index, sql] of MIGRATIONS.entries()) {
		if (index < applied) continue;
		db.exec('begin');
		try {
			db.exec(sql);
			// `pragma` accepts no bound parameters. The value is an index into a
			// literal array in this file, so no caller can reach it.
			db.exec(`pragma user_version = ${index + 1}`);
			db.exec('commit');
		} catch (error) {
			db.exec('rollback');
			throw error;
		}
	}
	return MIGRATIONS.length;
}

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const MEMORY_DATABASE_PATH = ':memory:';

function prepareDatabaseFile(path: string): void {
	const directory = dirname(path);
	const created = mkdirSync(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
	if (
		process.platform !== 'win32' &&
		created === undefined &&
		(statSync(directory).mode & 0o077) !== 0
	) {
		throw new Error(`database directory must be private (0700): ${directory}`);
	}
	// Pre-existing journals may contain newer credential data than the main file;
	// secure every known file before SQLite reads migrations or recovery state.
	const descriptor = openSync(path, 'a', PRIVATE_FILE_MODE);
	closeSync(descriptor);
	secureSQLiteFiles(path);
}

function secureSQLiteFiles(path: string): void {
	if (path === MEMORY_DATABASE_PATH) return;
	for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
		if (existsSync(candidate)) chmodSync(candidate, PRIVATE_FILE_MODE);
	}
}

/**
 * Open the application database and bring its schema up to date.
 *
 * This is deliberately not the food database. `data/db/fit-food-full.sqlite` is
 * regenerated wholesale by the ETL pipeline, so user rows kept in it would be
 * destroyed by the next rebuild.
 */
export function openDatabase(
	path: string,
	create: (databasePath: string) => DatabaseSync = (databasePath) => new DatabaseSync(databasePath)
): DatabaseSync {
	if (path !== MEMORY_DATABASE_PATH) prepareDatabaseFile(path);
	let db: DatabaseSync | undefined;
	try {
		db = create(path);
		// SQLite defaults foreign keys off, and the setting is ignored inside a
		// transaction — so it has to happen here, before the first migration runs.
		db.exec('pragma foreign_keys = on');
		db.exec('pragma journal_mode = wal');
		// Wait rather than fail when another connection holds the write lock.
		db.exec('pragma busy_timeout = 5000');
		migrate(db);
		secureSQLiteFiles(path);
		return db;
	} catch (error) {
		if (db) {
			try {
				db.close();
			} catch {
				// Preserve the opening or migration failure that made this connection unsafe.
			}
		}
		secureSQLiteFiles(path);
		throw error;
	}
}

let applicationDatabase: DatabaseSync | undefined;

/** Resolve configuration separately so its default is testable without opening the singleton. */
export function applicationDatabasePath(configured = process.env['FIT_DB_PATH']): string {
	return configured ?? 'data/runtime/app.sqlite';
}

/** The process-wide application connection shared by hooks and future endpoints. */
export function getDatabase(): DatabaseSync {
	applicationDatabase ??= openDatabase(applicationDatabasePath());
	return applicationDatabase;
}
