import { randomBytes } from 'node:crypto';
import { ENV_FILE, REMOTE_NODE, SERVICE_USER, shellQuote } from './config';

/**
 * The throwaway account the smoke check registers, and its removal.
 *
 * The registration round trip is the only check that touches SQLite, the
 * migration list, scrypt and the session cookie at once, so it is worth doing
 * against the real machine on every deploy — but it wrote a row per deploy into
 * the production `account` table and nothing ever took one out. Left alone that
 * is an accounts table that is mostly not accounts, and every question asked of
 * it ("how many people use this?") has to know to exclude them.
 *
 * The alternative considered was to leave the rows and make them prunable by
 * hand. They already were: `smoke.<ms>.<hex>` is unmistakable. Prunable by hand
 * is not a bound — it is a chore nobody is assigned — so the check cleans up
 * after itself instead, and the bound is enforced by the deploy that created
 * the row rather than by remembering.
 *
 * What it may delete is deliberately narrow. The username pattern is checked
 * twice, once here and once inside the process that runs the statements, and
 * both statements match one username exactly. A household is only removed when
 * the smoke account is its sole member, so a shared household can never be
 * taken out from under the people in it. Nothing else in this repository
 * deletes user data, and this is not the place to start.
 */

/** Exactly what `smokeUsername()` produces, and the only thing removal will match. */
const SMOKE_USERNAME = /^smoke\.[0-9]+\.[0-9a-f]{6}$/;

/** Enough randomness that two deploys in the same millisecond do not collide. */
const SUFFIX_BYTES = 3;

export function smokeUsername(now = Date.now()): string {
	return `smoke.${now}.${randomBytes(SUFFIX_BYTES).toString('hex')}`;
}

/**
 * The household the smoke account owns, and only while it owns it alone.
 *
 * Registration creates a household, a membership and a profile beside the
 * account. Deleting the account alone cascades the membership and blanks the
 * profile's `account_id`, which would leave an empty household and a nameless
 * profile behind for every deploy — the same unbounded growth one table over.
 * Deleting the household cascades both.
 */
const HOUSEHOLD_STATEMENT = `delete from household
	where id in (
		select household_id from membership
		where account_id = (select id from account where username = ?)
	)
	and (select count(*) from membership where household_id = household.id) = 1`;

const ACCOUNT_STATEMENT = 'delete from account where username = ?';

/**
 * The program that runs on the machine, as the service user and under the
 * pinned runtime, so it sees the same `node:sqlite` the server does.
 *
 * `node -e` puts the first user argument at `argv[1]`, not `argv[2]`: there is
 * no script path to skip. Getting that wrong would pass `undefined` as the
 * username, which the guard below turns into a refusal rather than a delete of
 * whatever `undefined` matches.
 */
export const REMOVAL_PROGRAM = `import { DatabaseSync } from 'node:sqlite';

const [databasePath, username] = process.argv.slice(1);
if (databasePath === undefined || !${SMOKE_USERNAME.toString()}.test(username ?? '')) {
	throw new Error('refusing to remove ' + username + ': not a smoke account');
}
const db = new DatabaseSync(databasePath);
try {
	db.exec('pragma foreign_keys = on');
	db.exec('pragma busy_timeout = 5000');
	db.exec('begin');
	try {
		const households = db.prepare(\`${HOUSEHOLD_STATEMENT}\`).run(username).changes;
		const accounts = db.prepare('${ACCOUNT_STATEMENT}').run(username).changes;
		db.exec('commit');
		process.stdout.write(JSON.stringify({ accounts: Number(accounts), households: Number(households) }));
	} catch (error) {
		db.exec('rollback');
		throw error;
	}
} finally {
	db.close();
}
`;

/**
 * The removal as a remote shell script.
 *
 * The database path is read from the environment file the unit itself reads,
 * rather than from this repository's copy of the template: the machine owns
 * that file, and a deploy that overwrote it would delete secrets, so the two
 * are allowed to differ and only one of them is true.
 */
export function removeSmokeAccountScript(username: string): string {
	if (!SMOKE_USERNAME.test(username)) {
		throw new Error(`refusing to remove ${username}: not a smoke account`);
	}
	const program = Buffer.from(REMOVAL_PROGRAM, 'utf8').toString('base64');
	return `database=$(sed -n 's/^FIT_DB_PATH=//p' ${ENV_FILE} | tail -n 1)
test -n "$database"
program=$(echo ${program} | base64 -d)
runuser -u ${SERVICE_USER} -- ${REMOTE_NODE} --input-type=module -e "$program" "$database" ${shellQuote(username)}`;
}

/**
 * What the program printed, so a caller can say whether the row is really gone.
 *
 * Anything else is `-1` rather than a thrown parse error: the caller reports
 * this number in a failed check, and "deleted -1 account rows" alongside the
 * output is a more useful thing to read at the end of a deploy than a
 * `SyntaxError` from a machine that answered with something unexpected.
 */
export function removedAccounts(output: string): number {
	let parsed: unknown;
	try {
		parsed = JSON.parse(output);
	} catch {
		return -1;
	}
	const accounts = (parsed as { accounts?: unknown }).accounts;
	return typeof accounts === 'number' ? accounts : -1;
}
