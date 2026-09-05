import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { integer } from '../users/rows';

/**
 * The ceiling on what reading photos can cost.
 *
 * Every other limit in this application protects an account; this one protects
 * a prepaid balance, so it is counted in rows rather than in a process map —
 * a restart must not hand an attacker, or a loop, a fresh allowance. It is the
 * shape `users/throttle.ts` uses, with the window fixed to the UTC calendar day
 * so the reset is something a person can read off a clock rather than a
 * rolling window they have to be told about.
 *
 * A call is counted when it is sent to the model, whatever the model answers:
 * a request that times out is billed the same as one that works.
 */

/**
 * Forty plates a day is more meals than anybody logs and is roughly a quarter
 * of a cent of spend at the measured per-call cost.
 */
export const ACCOUNT_DAILY_LIMIT = 40;

/**
 * Ten full accounts' worth. At the measured $0.000057 a call this caps the
 * deployment at about two and a half cents a day, so a $10 prepaid balance
 * cannot be drained by anything short of a year of abuse.
 */
export const GLOBAL_DAILY_LIMIT = 400;

/** The deployment-wide row has no account; the empty string is its holder. */
const EVERYONE = '';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type QuotaDecision =
	| { allowed: true }
	/** How long until the calendar day turns over and the allowance returns. */
	| { allowed: false; retryAfterMs: number };

/** The UTC calendar day as `YYYY-MM-DD`; the key both counters are filed under. */
export function utcDay(now: Date): string {
	// `toISOString` is UTC by definition, so this needs no timezone handling.
	return now.toISOString().slice(0, 10);
}

/** Milliseconds until the next UTC midnight, which is always at least one. */
export function msUntilNextUtcDay(now: Date): number {
	const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + MS_PER_DAY;
	return Math.max(1, midnight - now.getTime());
}

/**
 * Add one to a counter and report what it now stands at.
 *
 * `returning` is what makes this a reservation rather than a read: the count
 * that comes back is the one this call created, so two callers incrementing the
 * same row are handed different numbers and cannot both believe they were
 * under the ceiling.
 */
function countOne(db: DatabaseSync, scope: string, holder: string, day: string): number {
	const row = db
		.prepare(
			`insert into photo_quota (scope, holder, day, calls)
			 values (?, ?, ?, 1)
			 on conflict (scope, holder, day) do update set calls = calls + 1
			 returning calls`
		)
		.get(scope, holder, day) as Record<string, SQLOutputValue>;
	// The statement either inserts or updates, so SQLite always returns its one
	// row — asserted the way `db.ts` asserts the `user_version` pragma's.
	return integer(row, 'calls');
}

/**
 * Take one call out of the day's allowance, before it is spent.
 *
 * This is a reservation and not a check, because a check is a lie the moment
 * the caller awaits anything: the vision call takes up to twenty seconds, and
 * forty overlapping requests from one account would all read the same zero and
 * all be allowed. Counting first is what makes the ceiling a ceiling.
 *
 * Both counters move together inside one transaction, and a reservation that
 * breaches either ceiling is rolled back whole — so a refused caller leaves no
 * increment behind, and an account that is over its own limit cannot spend the
 * deployment's allowance by hammering the endpoint.
 *
 * The reservation is not given back when the call fails upstream: a request
 * that timed out was still paid for.
 */
export function reservePhotoCall(
	db: DatabaseSync,
	accountId: string,
	now = new Date()
): QuotaDecision {
	const day = utcDay(now);
	// `immediate` takes the write lock up front, so two connections cannot both
	// read their counters and then discover the conflict at commit.
	db.exec('begin immediate');
	try {
		const mine = countOne(db, 'account', accountId, day);
		const everyone = countOne(db, 'global', EVERYONE, day);
		if (mine > ACCOUNT_DAILY_LIMIT || everyone > GLOBAL_DAILY_LIMIT) {
			db.exec('rollback');
			return { allowed: false, retryAfterMs: msUntilNextUtcDay(now) };
		}
		// Swept on the write, as the sign-in throttle is: this is the only moment
		// the table grows.
		prunePhotoQuota(db, now);
		db.exec('commit');
		return { allowed: true };
	} catch (error) {
		db.exec('rollback');
		throw error;
	}
}

/** Drop the rows for days that have already turned over. */
export function prunePhotoQuota(db: DatabaseSync, now = new Date()): number {
	const result = db.prepare('delete from photo_quota where day < ?').run(utcDay(now));
	return Number(result.changes);
}
