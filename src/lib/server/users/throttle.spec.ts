import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db';
import {
	ADDRESS_POLICY,
	checkSignIn,
	clearSignInFailures,
	pruneSignInThrottle,
	recordFailedSignIn,
	USERNAME_POLICY
} from './throttle';
import type { SignInAttempt, ThrottleDecision, ThrottleScope } from './throttle';

const NOW = new Date('2026-08-29T09:00:00.000Z');
const MINUTE_MS = 60 * 1000;

const jordan: SignInAttempt = { username: 'jordan', clientAddress: '203.0.113.7' };

let db: DatabaseSync;

beforeEach(() => {
	db = openDatabase(':memory:');
});

function at(offsetMs: number): Date {
	return new Date(NOW.getTime() + offsetMs);
}

/** Fail `times` in a row from the same moment, and report the last decision. */
function fail(attempt: SignInAttempt, times: number, now = NOW): ThrottleDecision {
	let decision: ThrottleDecision = { allowed: true };
	for (let attemptNumber = 0; attemptNumber < times; attemptNumber += 1) {
		decision = recordFailedSignIn(db, attempt, now);
	}
	return decision;
}

function rowCount(): unknown {
	return db.prepare('select count(*) as n from sign_in_throttle').get()?.['n'];
}

describe('checkSignIn', () => {
	it('allows an attempt from a client that has never failed', () => {
		expect(checkSignIn(db, jordan, NOW)).toEqual({ allowed: true });
	});

	it('still allows the last attempt before the limit', () => {
		fail(jordan, USERNAME_POLICY.limit - 1);
		expect(checkSignIn(db, jordan, NOW)).toEqual({ allowed: true });
	});

	it('locks the username once the limit is reached', () => {
		fail(jordan, USERNAME_POLICY.limit);
		expect(checkSignIn(db, jordan, NOW)).toEqual({
			allowed: false,
			scope: 'username',
			retryAfterMs: USERNAME_POLICY.baseLockMs
		});
	});

	it('names the scope that imposed the wait, so a caller can say which guard fired', () => {
		const decision = fail(jordan, USERNAME_POLICY.limit);
		const scope: ThrottleScope | null = decision.allowed ? null : decision.scope;
		expect(scope).toBe('username');
	});

	it('allows the attempt again once the lock has run out', () => {
		fail(jordan, USERNAME_POLICY.limit);
		expect(checkSignIn(db, jordan, at(USERNAME_POLICY.baseLockMs))).toEqual({ allowed: true });
	});

	it('still refuses a moment before the lock ends', () => {
		fail(jordan, USERNAME_POLICY.limit);
		expect(checkSignIn(db, jordan, at(USERNAME_POLICY.baseLockMs - 1))).toMatchObject({
			allowed: false,
			retryAfterMs: 1
		});
	});

	it('locks the name people typed, not the account behind it', () => {
		// The username scope must behave the same whether or not the account
		// exists; a lockout that only ever fired for real names would answer
		// "does this person exist" for free.
		const unknown: SignInAttempt = { username: 'nobody-here', clientAddress: '203.0.113.7' };
		fail(unknown, USERNAME_POLICY.limit);
		expect(checkSignIn(db, unknown, NOW)).toMatchObject({ allowed: false, scope: 'username' });
	});

	it('normalizes the username, so casing does not buy another five attempts', () => {
		fail(jordan, USERNAME_POLICY.limit);
		expect(checkSignIn(db, { ...jordan, username: 'JORDAN' }, NOW)).toMatchObject({
			allowed: false
		});
	});

	it('does not lock a different username on the same address', () => {
		fail(jordan, USERNAME_POLICY.limit);
		expect(checkSignIn(db, { username: 'sam', clientAddress: jordan.clientAddress }, NOW)).toEqual({
			allowed: true
		});
	});

	it('does not lock the same username from a different address', () => {
		// The username counter is deliberately global: an attacker who rotates
		// addresses must not get a fresh allowance against one account.
		fail(jordan, USERNAME_POLICY.limit);
		expect(checkSignIn(db, { ...jordan, clientAddress: '198.51.100.4' }, NOW)).toMatchObject({
			allowed: false,
			scope: 'username'
		});
	});

	it('locks the address once a spray across many usernames reaches its limit', () => {
		for (let index = 0; index < ADDRESS_POLICY.limit; index += 1) {
			recordFailedSignIn(db, { username: `victim-${index}`, clientAddress: '198.51.100.4' }, NOW);
		}
		expect(
			checkSignIn(db, { username: 'victim-never-tried', clientAddress: '198.51.100.4' }, NOW)
		).toMatchObject({ allowed: false, scope: 'address' });
	});

	it('reports the longest wait when both scopes are locked', () => {
		const sprayed = '198.51.100.4';
		for (let index = 0; index < ADDRESS_POLICY.limit; index += 1) {
			recordFailedSignIn(db, { username: `victim-${index}`, clientAddress: sprayed }, NOW);
		}
		// Ground down from somewhere else, so the username is three failures past
		// its limit while the address has only just reached its own.
		fail({ username: 'jordan', clientAddress: '203.0.113.7' }, USERNAME_POLICY.limit + 3);
		expect(checkSignIn(db, { username: 'jordan', clientAddress: sprayed }, NOW)).toEqual({
			allowed: false,
			scope: 'username',
			retryAfterMs: 8 * MINUTE_MS
		});
	});

	it('counts the username alone when the deployment has no client address', () => {
		const anonymous: SignInAttempt = { username: 'jordan', clientAddress: null };
		fail(anonymous, USERNAME_POLICY.limit);
		expect(checkSignIn(db, anonymous, NOW)).toMatchObject({ allowed: false, scope: 'username' });
		expect(rowCount()).toBe(1);
	});
});

describe('recordFailedSignIn', () => {
	it('reports the lock it has just imposed', () => {
		expect(fail(jordan, USERNAME_POLICY.limit)).toEqual({
			allowed: false,
			scope: 'username',
			retryAfterMs: USERNAME_POLICY.baseLockMs
		});
	});

	it('doubles the wait for each failure past the limit', () => {
		fail(jordan, USERNAME_POLICY.limit);
		expect(fail(jordan, 1)).toMatchObject({ retryAfterMs: 2 * MINUTE_MS });
		expect(fail(jordan, 1)).toMatchObject({ retryAfterMs: 4 * MINUTE_MS });
	});

	it('caps the wait rather than doubling it without bound', () => {
		expect(fail(jordan, USERNAME_POLICY.limit + 20)).toMatchObject({
			retryAfterMs: USERNAME_POLICY.maxLockMs
		});
	});

	it('forgets failures that never became a lock once the window closes', () => {
		fail(jordan, USERNAME_POLICY.limit - 1);
		fail(jordan, 1, at(USERNAME_POLICY.windowMs + 1));
		expect(checkSignIn(db, jordan, at(USERNAME_POLICY.windowMs + 1))).toEqual({ allowed: true });
	});

	it('keeps counting inside the window, so slow guessing still locks', () => {
		for (let index = 0; index < USERNAME_POLICY.limit; index += 1) {
			// One attempt every two minutes never leaves the fifteen-minute window.
			recordFailedSignIn(db, jordan, at(index * 2 * MINUTE_MS));
		}
		expect(checkSignIn(db, jordan, at(8 * MINUTE_MS))).toMatchObject({ allowed: false });
	});

	it('stores no attacker-supplied text, only its hash', () => {
		fail({ username: 'jordan', clientAddress: '203.0.113.7' }, 1);
		const stored = JSON.stringify(db.prepare('select * from sign_in_throttle').all());
		expect(stored).not.toContain('jordan');
		expect(stored).not.toContain('203.0.113.7');
	});

	it('accepts an oversized username without hashing unbounded input', () => {
		const long = 'j'.repeat(10_000);
		expect(fail({ username: long, clientAddress: null }, 1)).toEqual({ allowed: true });
		expect(rowCount()).toBe(1);
	});

	it('dates the attempt from the real clock when none is given', () => {
		for (let index = 0; index < USERNAME_POLICY.limit; index += 1) {
			recordFailedSignIn(db, jordan);
		}
		expect(checkSignIn(db, jordan)).toMatchObject({ allowed: false });
	});
});

describe('clearSignInFailures', () => {
	it('gives the account its full allowance back after a successful sign-in', () => {
		fail(jordan, USERNAME_POLICY.limit);
		clearSignInFailures(db, 'jordan');
		expect(checkSignIn(db, jordan, NOW)).toEqual({ allowed: true });
	});

	it('clears the normalized username, not the string as typed', () => {
		fail(jordan, USERNAME_POLICY.limit);
		clearSignInFailures(db, 'Jordan');
		expect(checkSignIn(db, jordan, NOW)).toEqual({ allowed: true });
	});

	it('leaves the address counter alone, so one valid account cannot reset a spray', () => {
		const address = '198.51.100.4';
		for (let index = 0; index < ADDRESS_POLICY.limit; index += 1) {
			recordFailedSignIn(db, { username: `victim-${index}`, clientAddress: address }, NOW);
		}
		clearSignInFailures(db, 'victim-0');
		expect(checkSignIn(db, { username: 'jordan', clientAddress: address }, NOW)).toMatchObject({
			allowed: false,
			scope: 'address'
		});
	});
});

describe('pruneSignInThrottle', () => {
	it('drops a row whose window has closed', () => {
		fail(jordan, 1);
		expect(pruneSignInThrottle(db, at(USERNAME_POLICY.windowMs + 1))).toBe(2);
		expect(rowCount()).toBe(0);
	});

	it('keeps a row whose window is still open', () => {
		fail(jordan, 1);
		expect(pruneSignInThrottle(db, at(USERNAME_POLICY.windowMs - 1))).toBe(0);
	});

	it('never outlives its own lock, so a sweep cannot free a locked scope early', () => {
		expect(USERNAME_POLICY.maxLockMs).toBeLessThanOrEqual(USERNAME_POLICY.windowMs);
		expect(ADDRESS_POLICY.maxLockMs).toBeLessThanOrEqual(ADDRESS_POLICY.windowMs);
	});

	it('runs as part of recording a failure, so the table does not grow unbounded', () => {
		fail({ username: 'first', clientAddress: '198.51.100.4' }, 1);
		fail(
			{ username: 'second', clientAddress: '198.51.100.5' },
			1,
			at(USERNAME_POLICY.windowMs + 1)
		);
		// Only the second attempt's two rows survive: the first pair expired.
		expect(rowCount()).toBe(2);
	});
});
