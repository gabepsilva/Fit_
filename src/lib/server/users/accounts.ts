import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '../db';
import { newId } from './ids';
import { hashPassword, OWASP_SCRYPT, passwordProblem, verifyPassword } from './password';
import type { PasswordProblem } from './password';
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
	| { ok: true; account: Account }
	| { ok: false; problem: UsernameProblem | PasswordProblem | 'username-taken' };

/** SQLITE_CONSTRAINT_UNIQUE. Matched on the code, because the message text is not API. */
const SQLITE_CONSTRAINT_UNIQUE = 2067;

function isUsernameTaken(error: unknown): boolean {
	return error instanceof Error && 'errcode' in error && error.errcode === SQLITE_CONSTRAINT_UNIQUE;
}

/**
 * The four rows a new account needs: itself, the household it owns, the
 * membership joining them, and its own profile. Registration is the only place
 * that writes all four, and it writes them inside one transaction, so a failure
 * on the last cannot leave an account that belongs to no household.
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
	// Everyone whose intake is tracked is a profile. This is the one that also
	// happens to be able to sign in; a partner or a child gets a profile row with
	// no `account_id` and never sees this table.
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
	const username = normalizeUsername(input.username);
	const problem = usernameProblem(username) ?? passwordProblem(input.password);
	if (problem) return { ok: false, problem };
	const passwordHash = await hashPassword(input.password, cost);
	const displayName = input.displayName.trim() || username;
	const account: Account = {
		id: newId(now.getTime()),
		username,
		displayName,
		createdAt: now.toISOString()
	};
	const householdName = input.householdName.trim() || displayName;
	try {
		transaction(db, () => insertAccount(db, account, passwordHash, householdName));
	} catch (error) {
		// The unique index on `username` is what decides this, not a prior SELECT:
		// two sign-ups racing for the same name would both pass the check.
		if (isUsernameTaken(error)) return { ok: false, problem: 'username-taken' };
		throw error;
	}
	return { ok: true, account };
}

/**
 * The account for these credentials, or `null`.
 *
 * An unknown username costs the same as a wrong password, because the caller
 * can otherwise time the difference and learn which usernames exist — the whole
 * exposure of a system where the username is the only identifier.
 */
export async function authenticate(
	db: DatabaseSync,
	username: string,
	password: string,
	cost = OWASP_SCRYPT
): Promise<Account | null> {
	const row = db
		.prepare(
			'select id, username, display_name, password_hash, created_at from account where username = ?'
		)
		.get(normalizeUsername(username));
	if (!row) {
		await hashPassword(password, cost);
		return null;
	}
	if (!(await verifyPassword(password, text(row, 'password_hash')))) return null;
	return {
		id: text(row, 'id'),
		username: text(row, 'username'),
		displayName: text(row, 'display_name'),
		createdAt: text(row, 'created_at')
	};
}

/**
 * Every household this account belongs to. Resolved once per request and put on
 * `locals`, because `household_id` is the predicate every later query filters
 * on — a request that has not established it has no business reading rows.
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
