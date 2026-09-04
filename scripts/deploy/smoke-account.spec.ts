import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/lib/server/db';
import { registerAccount } from '../../src/lib/server/users/accounts';
import {
	REMOVAL_PROGRAM,
	removeSmokeAccountScript,
	removedAccounts,
	smokeUsername
} from './smoke-account';

/**
 * The removal is run, not inspected: it is a program that reaches the machine
 * as base64 and is executed by `node -e` against the live accounts database,
 * and the two ways it could be wrong — the wrong `argv` offset, or SQL that
 * matches more rows than the one account — are both invisible in the text.
 *
 * So the schema here is the real one, the account is created by the real
 * registration path, and the program is invoked exactly as the shell script
 * invokes it. A bystander account sits beside it in every case, because the
 * failure that matters is not "the row survived".
 */

const runProgram = promisify(execFile);

/** See `password.spec.ts`: the production scrypt cost is too slow to test at. */
const CHEAP = { n: 2 ** 12, r: 8, p: 1 };

let directory: string;
let databasePath: string;
let db: DatabaseSync;

beforeEach(async () => {
	directory = await mkdtemp(path.join(os.tmpdir(), 'fit-smoke-account-'));
	databasePath = path.join(directory, 'app.sqlite');
	db = openDatabase(databasePath);
});

afterEach(async () => {
	db.close();
	await rm(directory, { recursive: true, force: true });
});

async function register(username: string): Promise<string> {
	const result = await registerAccount(
		db,
		{
			username,
			displayName: 'Deploy smoke check',
			password: 'correct horse battery staple',
			householdName: 'Deploy smoke check'
		},
		CHEAP
	);
	if (!result.ok) throw new Error(`could not register ${username}`);
	return result.account.id;
}

/** As `removeSmokeAccountScript` runs it on the machine, minus the ssh and the service user. */
async function remove(username: string): Promise<string> {
	const { stdout } = await runProgram(process.execPath, [
		'--input-type=module',
		'-e',
		REMOVAL_PROGRAM,
		databasePath,
		username
	]);
	return stdout;
}

function count(table: 'account' | 'household' | 'membership' | 'profile'): number {
	const row = db.prepare(`select count(*) as total from ${table}`).get() as { total: number };
	return row.total;
}

describe('removing the account the smoke check created', () => {
	it('takes out the account and the household it owns alone', async () => {
		const smoke = smokeUsername();
		await register(smoke);
		await register('jordan');
		expect(removedAccounts(await remove(smoke))).toBe(1);
		expect(count('account')).toBe(1);
		expect(count('household')).toBe(1);
		expect(count('membership')).toBe(1);
		expect(count('profile')).toBe(1);
	});

	it('leaves every other account exactly where it was', async () => {
		const smoke = smokeUsername();
		await register(smoke);
		const bystander = await register('jordan');
		await remove(smoke);
		const rows = db.prepare('select id, username from account').all();
		expect(rows).toEqual([{ id: bystander, username: 'jordan' }]);
	});

	it('reports a machine that answered with something else, rather than throwing', () => {
		expect(removedAccounts('systemd-run: command not found')).toBe(-1);
		expect(removedAccounts('{"accounts":"one"}')).toBe(-1);
	});

	it('reports zero when the account is not there, rather than passing quietly', async () => {
		// A removal that matched nothing used to be indistinguishable from one
		// that worked; the count is what the smoke check asserts on.
		expect(removedAccounts(await remove(smokeUsername()))).toBe(0);
	});

	it('keeps a household somebody else is also in', async () => {
		// Never reached by a real smoke run — its household is always its own —
		// but the statement is a `delete` against the production database, so
		// the guard is asserted rather than reasoned about.
		const smoke = smokeUsername();
		await register(smoke);
		const lodger = await register('jordan');
		const household = db.prepare('select household_id as id from membership limit 1').get() as {
			id: string;
		};
		db.prepare(
			"insert into membership (household_id, account_id, role, created_at) values (?, ?, 'member', ?)"
		).run(household.id, lodger, new Date().toISOString());
		expect(removedAccounts(await remove(smoke))).toBe(1);
		expect(count('household')).toBe(2);
	});

	it('refuses a username that is not one of its own', async () => {
		await register('jordan');
		await expect(remove('jordan')).rejects.toThrow('not a smoke account');
		expect(count('account')).toBe(1);
	});
});

describe('the removal script', () => {
	it('refuses to be built for an account the smoke check did not create', () => {
		expect(() => removeSmokeAccountScript('jordan')).toThrow('not a smoke account');
	});

	it('runs as the service user under the pinned runtime', () => {
		// As root it would create a root-owned -wal beside the database whenever
		// the unit is not holding one open, and the service could not write it.
		const script = removeSmokeAccountScript(smokeUsername());
		expect(script).toContain('runuser -u fit -- /opt/node/bin/node');
	});

	it('reads the database path from the file the unit reads', () => {
		expect(removeSmokeAccountScript(smokeUsername())).toContain('/etc/fit/fit.env');
	});
});

describe('the username the smoke check registers', () => {
	it('is named for the clock, so the rows sort by the deploy that made them', () => {
		expect(smokeUsername(1_700_000_000_000)).toMatch(/^smoke\.1700000000000\.[0-9a-f]{6}$/);
	});

	it('is not repeated within a millisecond', () => {
		expect(smokeUsername(1)).not.toBe(smokeUsername(1));
	});
});
