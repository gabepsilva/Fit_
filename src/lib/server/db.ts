import { chmodSync, closeSync, existsSync, mkdirSync, openSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Schema versions, oldest first; the applied count is `user_version`.
 * Append-only: a shipped entry is skipped by every database that ran it.
 * `household_id` is on every data table from v1, so tenancy is never added
 * to a table that already holds live rows.
 */
const MIGRATIONS = [
	`
	create table account (
		id            text primary key,
		username      text not null unique,
		display_name  text not null,
		-- Nullable: no verification flow yet, and carrying it avoids a later
		-- migration over live credentials.
		email         text,
		password_hash text not null,
		-- Hashed one-time recovery code; with no email, the only reset path.
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
		-- Null for tracked people without an account (partner, child); this is
		-- why account and profile are two tables.
		account_id   text references account (id) on delete set null,
		name         text not null,
		created_at   text not null,
		-- A signed-in profile must match a membership, not just any account and
		-- household that happen to exist.
		foreign key (household_id, account_id)
			references membership (household_id, account_id),
		unique (household_id, account_id)
	) strict;

	create index profile_by_household on profile (household_id);

	-- Removing login access keeps the profile and its history; must run before
	-- the composite membership FK is checked.
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
	-- Failed sign-in attempts per scope. Rows never reference the account
	-- table, so a lockout cannot answer "does this username exist".
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
	-- Add the registration scope. SQLite cannot widen a check in place, so
	-- the table is rebuilt; rows are carried over, because dropping them would
	-- reset every lockout on deploy.
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

	-- The expiry index was rebuilt with its table.
	create index sign_in_throttle_expiry on sign_in_throttle (window_ends_at);
	`,
	`
	-- One JSON document per household: the whole client-side store, versioned
	-- so a stale writer loses to whoever wrote last rather than clobbering it.
	create table household_state (
		household_id text primary key references household (id) on delete cascade,
		format       text not null,
		body         text not null,
		version      integer not null,
		updated_at   text not null,
		updated_by   text not null references account (id)
	) strict;
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
			// `pragma` takes no bound parameters; the value is a literal array index in this file.
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
	// Journals may hold credential data; harden every sidecar before SQLite reads them.
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
 * Deliberately not the food database: `fit-food-full.sqlite` is rebuilt
 * wholesale by ETL and would destroy user rows kept in it.
 */
export function openDatabase(
	path: string,
	create: (databasePath: string) => DatabaseSync = (databasePath) => new DatabaseSync(databasePath)
): DatabaseSync {
	if (path !== MEMORY_DATABASE_PATH) prepareDatabaseFile(path);
	let db: DatabaseSync | undefined;
	try {
		db = create(path);
		// `foreign_keys` is off by default and ignored inside transactions; set
		// it before the first migration runs.
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
