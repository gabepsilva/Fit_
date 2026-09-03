import type { DatabaseSync } from 'node:sqlite';
import { newId } from './ids';
import {
	hashPassword,
	MAX_PASSWORD_LENGTH,
	OWASP_SCRYPT,
	passwordProblem,
	verifyPasswordAtPolicy
} from './password';
import type { PasswordProblem, ScryptCost } from './password';
import { storedTextProblem } from './input';
import type { StoredTextProblem } from './input';
import { text } from './rows';
import type { Account, Membership } from './types';
import { normalizeUsername, usernameProblem } from './username';
import type { UsernameProblem } from './username';

export type Registration = {
	username: string;
	displayName: string;
	password: string;
	householdName: string;
};

export type RegistrationResult =
	{ ok: true; account: Account } | { ok: false; problem: RegistrationProblem };

type RegistrationProblem =
	| { field: 'username'; code: UsernameProblem | 'taken' }
	| { field: 'password'; code: PasswordProblem }
	| StoredTextProblem;

export type AuthenticationOptions = {
	cost?: ScryptCost;
	now?: Date;
};

/** Names are stored verbatim, so reject oversize input before trimming or persistence. */
const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_HOUSEHOLD_NAME_LENGTH = 100;

function registrationProblem(input: Registration): RegistrationProblem | null {
	const username = usernameProblem(input.username);
	if (username) return { field: 'username', code: username };
	const password = passwordProblem(input.password);
	if (password) return { field: 'password', code: password };
	return (
		storedTextProblem(input.displayName, 'displayName', MAX_DISPLAY_NAME_LENGTH) ??
		storedTextProblem(input.householdName, 'householdName', MAX_HOUSEHOLD_NAME_LENGTH)
	);
}

/** SQLITE_CONSTRAINT_UNIQUE. Matched on the code, because the message text is not API. */
const SQLITE_CONSTRAINT_UNIQUE = 2067;

function isUsernameTaken(error: unknown): boolean {
	return error instanceof Error && 'errcode' in error && error.errcode === SQLITE_CONSTRAINT_UNIQUE;
}

/**
 * The four rows a new account needs: itself, its household, the membership
 * joining them, and its own profile. One transaction, so a failure cannot leave
 * an account that belongs to no household.
 */
function insertAccount(
	db: DatabaseSync,
	account: Account,
	passwordHash: string,
	householdName: string
): void {
	const stamp = account.createdAt;
	const householdId = newId();
	db.prepare(
		`insert into account (id, username, display_name, password_hash, created_at, updated_at)
		 values (?, ?, ?, ?, ?, ?)`
	).run(account.id, account.username, account.displayName, passwordHash, stamp, stamp);
	db.prepare('insert into household (id, name, created_at) values (?, ?, ?)').run(
		householdId,
		householdName,
		stamp
	);
	db.prepare(
		'insert into membership (household_id, account_id, role, created_at) values (?, ?, ?, ?)'
	).run(householdId, account.id, 'owner', stamp);
	// Every tracked person has a profile; this one also has an `account_id`.
	db.prepare(
		'insert into profile (id, household_id, account_id, name, created_at) values (?, ?, ?, ?, ?)'
	).run(newId(), householdId, account.id, account.displayName, stamp);
}

/** Create an account, the household it owns, and its profile. */
export async function registerAccount(
	db: DatabaseSync,
	input: Registration,
	cost = OWASP_SCRYPT,
	now = new Date()
): Promise<RegistrationResult> {
	const problem = registrationProblem(input);
	if (problem) return { ok: false, problem };
	const username = normalizeUsername(input.username);
	const passwordHash = await hashPassword(input.password, cost);
	const displayName = input.displayName.trim() || username;
	const account: Account = {
		id: newId(now.getTime()),
		username,
		displayName,
		createdAt: now.toISOString()
	};
	const householdName = input.householdName.trim() || displayName;
	db.exec('begin');
	try {
		insertAccount(db, account, passwordHash, householdName);
		db.exec('commit');
	} catch (error) {
		db.exec('rollback');
		// Decided by the unique index, not a prior SELECT: racing sign-ups would both pass a check.
		if (isUsernameTaken(error)) {
			return { ok: false, problem: { field: 'username', code: 'taken' } };
		}
		throw error;
	}
	return { ok: true, account };
}

/**
 * The account for these credentials, or `null`. An unknown username costs the
 * same as a wrong password; timing the difference would reveal which usernames
 * exist.
 */
export async function authenticate(
	db: DatabaseSync,
	username: string,
	password: string,
	options: AuthenticationOptions = {}
): Promise<Account | null> {
	const cost = options.cost ?? OWASP_SCRYPT;
	const now = options.now ?? new Date();
	// Refuse oversized input before normalizing or hashing. Too-short passwords are
	// still verified below, so they reveal no more than a real attempt.
	if (usernameProblem(username) || password.length > MAX_PASSWORD_LENGTH) return null;
	const normalizedUsername = normalizeUsername(username);
	const row = db
		.prepare(
			'select id, username, display_name, password_hash, created_at from account where username = ?'
		)
		.get(normalizedUsername);
	if (!row) {
		await verifyPasswordAtPolicy(password, null, cost);
		return null;
	}
	const storedHash = text(row, 'password_hash');
	const verification = await verifyPasswordAtPolicy(password, storedHash, cost);
	if (!verification.verified) return null;
	if (verification.upgradeHash) {
		db.prepare(
			'update account set password_hash = ?, updated_at = ? where id = ? and password_hash = ?'
		).run(verification.upgradeHash, now.toISOString(), text(row, 'id'), storedHash);
	}
	return {
		id: text(row, 'id'),
		username: text(row, 'username'),
		displayName: text(row, 'display_name'),
		createdAt: text(row, 'created_at')
	};
}

/**
 * Every household this account belongs to, resolved once per request onto
 * `locals`. `household_id` is the predicate every later query filters on.
 */
export function membershipsFor(db: DatabaseSync, accountId: string): Membership[] {
	const rows = db
		.prepare(
			`select h.id as household_id, h.name, m.role
			 from membership m
			 join household h on h.id = m.household_id
			 where m.account_id = ?
			 order by h.created_at`
		)
		.all(accountId);
	return rows.map((row) => ({
		householdId: text(row, 'household_id'),
		name: text(row, 'name'),
		role: text(row, 'role') === 'owner' ? 'owner' : 'member'
	}));
}
