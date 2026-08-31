import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db';
import {
	ADDRESS_POLICY,
	checkRegistration,
	checkSignIn,
	clearSignInFailures,
	pruneSignInThrottle,
	recordFailedSignIn,
	recordRegistration,
	REGISTRATION_POLICY,
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

/**
 * Every case opens its own in-memory database; closing it is not tidiness. A
 * mutation run puts one vitest inside every worker and replays this suite
 * hundreds of times, and hundreds of live `node:sqlite` handles left for the
 * collector took the worker down with SIGSEGV -- which Stryker records as a
 * timeout against whichever mutant happened to be running.
 */
afterEach(() => {
	db.close();
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

	it('reports the address wait when that is the longer of the two', () => {
		// The mirror of the case above: whichever scope holds the caller longest is
		// the one it is told about, or it comes back before the other lock ends.
		const sprayed = '198.51.100.4';
		for (let index = 0; index < ADDRESS_POLICY.limit + 3; index += 1) {
			recordFailedSignIn(db, { username: `victim-${index}`, clientAddress: sprayed }, NOW);
		}
		// Ground down from somewhere else, so the address lock has doubled three
		// times while the username has only just reached its own limit.
		fail({ username: 'jordan', clientAddress: '203.0.113.9' }, USERNAME_POLICY.limit);
		expect(checkSignIn(db, { username: 'jordan', clientAddress: sprayed }, NOW)).toEqual({
			allowed: false,
			scope: 'address',
			retryAfterMs: 8 * MINUTE_MS
		});
	});

	it('keeps the first scope when both waits are exactly as long as each other', () => {
		const sprayed = '198.51.100.4';
		fail({ username: 'jordan', clientAddress: sprayed }, USERNAME_POLICY.limit);
		for (let index = 0; index < ADDRESS_POLICY.limit - USERNAME_POLICY.limit; index += 1) {
			recordFailedSignIn(db, { username: `victim-${index}`, clientAddress: sprayed }, NOW);
		}
		// Both scopes have just reached their limit at the same instant, so both
		// carry the same first lock; a tie is not a reason to change the answer.
		expect(checkSignIn(db, { username: 'jordan', clientAddress: sprayed }, NOW)).toEqual({
			allowed: false,
			scope: 'username',
			retryAfterMs: USERNAME_POLICY.baseLockMs
		});
	});

	it('counts an oversized username in the bucket the name it truncates to owns', () => {
		// The key is bounded before it is hashed, so the bound has to be part of
		// the identity: otherwise ten thousand characters is a fresh allowance.
		const long = 'j'.repeat(10_000);
		fail({ username: long, clientAddress: null }, USERNAME_POLICY.limit);
		expect(checkSignIn(db, { username: 'j'.repeat(128), clientAddress: null }, NOW)).toMatchObject({
			allowed: false,
			scope: 'username'
		});
	});

	it('counts an oversized address in the bucket the address it truncates to owns', () => {
		const long = `198.51.100.4${'0'.repeat(10_000)}`;
		for (let index = 0; index < ADDRESS_POLICY.limit; index += 1) {
			recordFailedSignIn(db, { username: `victim-${index}`, clientAddress: long }, NOW);
		}
		expect(
			checkSignIn(db, { username: 'someone-else', clientAddress: long.slice(0, 128) }, NOW)
		).toMatchObject({ allowed: false, scope: 'address' });
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

	it('puts the scope inside the hash, so the two counters cannot collide', () => {
		// The key is the SHA-256 of the scope, a NUL, and the normalized value:
		// pinned exactly, because a scope that dropped out of the digest would let
		// one address quietly spend the username counter's allowance.
		fail({ username: 'jordan', clientAddress: '203.0.113.7' }, 1);
		const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
		const rows = db.prepare('select scope, key_hash from sign_in_throttle order by scope').all();
		expect(rows.map((row) => [row['scope'], row['key_hash']])).toEqual([
			['address', digest('address\u0000203.0.113.7')],
			['username', digest('username\u0000jordan')]
		]);
	});

	it('records no lock at all while the attempt is still inside its allowance', () => {
		fail(jordan, 1);
		const rows = db.prepare('select locked_until from sign_in_throttle').all();
		expect(rows.map((row) => row['locked_until'])).toEqual([null, null]);
	});

	it('starts a fresh count for a failure at the very moment the window closes', () => {
		fail(jordan, USERNAME_POLICY.limit - 1);
		// The window ends exactly here, so this failure opens a new one rather
		// than being the sixth of the old one.
		fail(jordan, 1, at(USERNAME_POLICY.windowMs));
		expect(checkSignIn(db, jordan, at(USERNAME_POLICY.windowMs))).toEqual({ allowed: true });
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

	it('clears the bucket an oversized username was counted in', () => {
		const long = 'j'.repeat(10_000);
		fail({ username: long, clientAddress: null }, USERNAME_POLICY.limit);
		clearSignInFailures(db, long);
		expect(checkSignIn(db, { username: long, clientAddress: null }, NOW)).toEqual({
			allowed: true
		});
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
		expect(REGISTRATION_POLICY.maxLockMs).toBeLessThanOrEqual(REGISTRATION_POLICY.windowMs);
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

const HOUSEHOLD_ADDRESS = '203.0.113.7';

/** Register `times` in a row from one address, and report the last decision. */
function signUp(address: string | null, times: number, now = NOW): ThrottleDecision {
	let decision: ThrottleDecision = { allowed: true };
	for (let attempt = 0; attempt < times; attempt += 1) {
		decision = recordRegistration(db, address, now);
	}
	return decision;
}

describe('checkRegistration', () => {
	it('allows an address that has never registered anything', () => {
		expect(checkRegistration(db, HOUSEHOLD_ADDRESS, NOW)).toEqual({ allowed: true });
	});

	it('still allows the last sign-up before the limit', () => {
		// A household really does create several accounts in one sitting, and the
		// allowance exists so that it can.
		signUp(HOUSEHOLD_ADDRESS, REGISTRATION_POLICY.limit - 1);
		expect(checkRegistration(db, HOUSEHOLD_ADDRESS, NOW)).toEqual({ allowed: true });
	});

	it('locks the address once the limit is reached', () => {
		signUp(HOUSEHOLD_ADDRESS, REGISTRATION_POLICY.limit);
		expect(checkRegistration(db, HOUSEHOLD_ADDRESS, NOW)).toEqual({
			allowed: false,
			scope: 'registration',
			retryAfterMs: REGISTRATION_POLICY.baseLockMs
		});
	});

	it('allows the address again once the lock has run out', () => {
		signUp(HOUSEHOLD_ADDRESS, REGISTRATION_POLICY.limit);
		expect(checkRegistration(db, HOUSEHOLD_ADDRESS, at(REGISTRATION_POLICY.baseLockMs))).toEqual({
			allowed: true
		});
	});

	it('still refuses a moment before the lock ends', () => {
		signUp(HOUSEHOLD_ADDRESS, REGISTRATION_POLICY.limit);
		expect(
			checkRegistration(db, HOUSEHOLD_ADDRESS, at(REGISTRATION_POLICY.baseLockMs - 1))
		).toMatchObject({ allowed: false, retryAfterMs: 1 });
	});

	it('does not lock a different address', () => {
		signUp(HOUSEHOLD_ADDRESS, REGISTRATION_POLICY.limit);
		expect(checkRegistration(db, '198.51.100.4', NOW)).toEqual({ allowed: true });
	});

	it('allows every attempt when the deployment cannot determine an address', () => {
		// There is no username scope to fall back to: counting against a name
		// nobody owns yet would let one caller hold it out of ever being taken.
		expect(signUp(null, REGISTRATION_POLICY.limit + 1)).toEqual({ allowed: true });
		expect(checkRegistration(db, null, NOW)).toEqual({ allowed: true });
		expect(rowCount()).toBe(0);
	});

	it('reads an empty address as no address rather than as one every caller shares', () => {
		expect(signUp('', REGISTRATION_POLICY.limit + 1)).toEqual({ allowed: true });
		expect(rowCount()).toBe(0);
	});

	it('counts an oversized address in the bucket the address it truncates to owns', () => {
		const long = `198.51.100.4${'0'.repeat(10_000)}`;
		signUp(long, REGISTRATION_POLICY.limit);
		expect(checkRegistration(db, long.slice(0, 128), NOW)).toMatchObject({
			allowed: false,
			scope: 'registration'
		});
	});

	it('is not spent by failed sign-ins from the same address', () => {
		// The two scopes answer different attacks and are sized apart: a household
		// that mistyped its password must still be able to add a profile.
		for (let index = 0; index < ADDRESS_POLICY.limit; index += 1) {
			recordFailedSignIn(
				db,
				{ username: `victim-${index}`, clientAddress: HOUSEHOLD_ADDRESS },
				NOW
			);
		}
		expect(checkRegistration(db, HOUSEHOLD_ADDRESS, NOW)).toEqual({ allowed: true });
	});

	it('does not spend the sign-in allowance either', () => {
		signUp(HOUSEHOLD_ADDRESS, REGISTRATION_POLICY.limit);
		expect(checkSignIn(db, { username: 'jordan', clientAddress: HOUSEHOLD_ADDRESS }, NOW)).toEqual({
			allowed: true
		});
	});

	it('dates the attempt from the real clock when none is given', () => {
		for (let index = 0; index < REGISTRATION_POLICY.limit; index += 1) {
			recordRegistration(db, HOUSEHOLD_ADDRESS);
		}
		expect(checkRegistration(db, HOUSEHOLD_ADDRESS)).toMatchObject({ allowed: false });
	});
});

describe('recordRegistration', () => {
	it('reports the lock it has just imposed', () => {
		expect(signUp(HOUSEHOLD_ADDRESS, REGISTRATION_POLICY.limit)).toEqual({
			allowed: false,
			scope: 'registration',
			retryAfterMs: REGISTRATION_POLICY.baseLockMs
		});
	});

	it('doubles the wait for each attempt past the limit', () => {
		signUp(HOUSEHOLD_ADDRESS, REGISTRATION_POLICY.limit);
		expect(signUp(HOUSEHOLD_ADDRESS, 1)).toMatchObject({ retryAfterMs: 2 * MINUTE_MS });
		expect(signUp(HOUSEHOLD_ADDRESS, 1)).toMatchObject({ retryAfterMs: 4 * MINUTE_MS });
	});

	it('caps the wait rather than doubling it without bound', () => {
		expect(signUp(HOUSEHOLD_ADDRESS, REGISTRATION_POLICY.limit + 20)).toMatchObject({
			retryAfterMs: REGISTRATION_POLICY.maxLockMs
		});
	});

	it('records no lock while the address is still inside its allowance', () => {
		signUp(HOUSEHOLD_ADDRESS, 1);
		const rows = db.prepare('select locked_until from sign_in_throttle').all();
		expect(rows.map((row) => row['locked_until'])).toEqual([null]);
	});

	it('puts its own scope inside the hash, so it cannot share a bucket', () => {
		// The address scope counts failed sign-ins from this same address. If the
		// scope dropped out of the digest, one endpoint would spend the other's
		// allowance and both policies would mean nothing.
		signUp(HOUSEHOLD_ADDRESS, 1);
		const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
		const rows = db.prepare('select scope, key_hash from sign_in_throttle').all();
		expect(rows.map((row) => [row['scope'], row['key_hash']])).toEqual([
			['registration', digest(`registration\u0000${HOUSEHOLD_ADDRESS}`)]
		]);
	});

	it('stores no address text, only its hash', () => {
		signUp(HOUSEHOLD_ADDRESS, 1);
		const stored = JSON.stringify(db.prepare('select * from sign_in_throttle').all());
		expect(stored).not.toContain(HOUSEHOLD_ADDRESS);
	});

	it('forgets attempts that never became a lock once the window closes', () => {
		signUp(HOUSEHOLD_ADDRESS, REGISTRATION_POLICY.limit - 1);
		signUp(HOUSEHOLD_ADDRESS, 1, at(REGISTRATION_POLICY.windowMs + 1));
		expect(checkRegistration(db, HOUSEHOLD_ADDRESS, at(REGISTRATION_POLICY.windowMs + 1))).toEqual({
			allowed: true
		});
	});

	it('keeps counting inside the window, so slow sign-ups still lock', () => {
		for (let index = 0; index < REGISTRATION_POLICY.limit; index += 1) {
			recordRegistration(db, HOUSEHOLD_ADDRESS, at(index * 5 * MINUTE_MS));
		}
		expect(checkRegistration(db, HOUSEHOLD_ADDRESS, at(45 * MINUTE_MS))).toMatchObject({
			allowed: false
		});
	});

	it('sweeps the expired rows it writes beside, so the table does not grow unbounded', () => {
		signUp('198.51.100.4', 1);
		signUp(HOUSEHOLD_ADDRESS, 1, at(REGISTRATION_POLICY.windowMs + 1));
		expect(rowCount()).toBe(1);
	});
});
