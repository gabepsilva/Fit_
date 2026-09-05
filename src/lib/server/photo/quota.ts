import type { DatabaseSync } from 'node:sqlite';
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

function callsSoFar(db: DatabaseSync, scope: string, holder: string, day: string): number {
	const row = db
		.prepare('select calls from photo_quota where scope = ? and holder = ? and day = ?')
		.get(scope, holder, day);
	return row === undefined ? 0 : integer(row, 'calls');
}

function countOne(db: DatabaseSync, scope: string, holder: string, day: string): void {
	db.prepare(
		`insert into photo_quota (scope, holder, day, calls)
		 values (?, ?, ?, 1)
		 on conflict (scope, holder, day) do update set calls = calls + 1`
	).run(scope, holder, day);
}

/**
 * Whether this account may spend another call. Both ceilings are consulted:
 * one account cannot exhaust the deployment, and the deployment being busy
 * still stops an account that has had its share.
 */
export function checkPhotoQuota(
	db: DatabaseSync,
	accountId: string,
	now = new Date()
): QuotaDecision {
	const day = utcDay(now);
	const mine = callsSoFar(db, 'account', accountId, day);
	const everyone = callsSoFar(db, 'global', EVERYONE, day);
	if (mine < ACCOUNT_DAILY_LIMIT && everyone < GLOBAL_DAILY_LIMIT) return { allowed: true };
	return { allowed: false, retryAfterMs: msUntilNextUtcDay(now) };
}

/**
 * Count one call against both ceilings. Called at the moment the request goes
 * out, so a failure upstream is still spend that happened.
 */
export function recordPhotoCall(db: DatabaseSync, accountId: string, now = new Date()): void {
	const day = utcDay(now);
	countOne(db, 'account', accountId, day);
	countOne(db, 'global', EVERYONE, day);
	// Swept on the write, as the sign-in throttle is: this is the only moment
	// the table grows.
	prunePhotoQuota(db, now);
}

/** Drop the rows for days that have already turned over. */
export function prunePhotoQuota(db: DatabaseSync, now = new Date()): number {
	const result = db.prepare('delete from photo_quota where day < ?').run(utcDay(now));
	return Number(result.changes);
}
