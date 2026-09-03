import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { integer, text } from './rows';
import { normalizeUsername } from './username';

/**
 * Throttling for failed sign-ins and registrations. `username` and `address`
 * scopes are counted apart because they answer different attacks.
 * Counts are keyed on the submitted username, existing or not, so a lockout
 * cannot enumerate accounts; nothing here reads the account table.
 * Registration gets its own scope: it is the only endpoint that says a
 * username exists. State is rows, not a process map, so a restart is not a
 * free reset for an attacker.
 */

export type ThrottleScope = 'username' | 'address' | 'registration';

export type ThrottlePolicy = {
	/** Failures inside one window that pass before the scope locks. */
	limit: number;
	/** How long a failure is remembered when no further failure follows it. */
	windowMs: number;
	/** The first lock, doubling with every further failure. */
	baseLockMs: number;
	/** The ceiling on that doubling. Never above `windowMs`; see `advance`. */
	maxLockMs: number;
};

const MINUTE_MS = 60 * 1000;

/**
 * Five wrong passwords is a person who forgot theirs; the sixth starts a minute
 * of waiting that doubles to a quarter of an hour — roughly 30 guesses a day per
 * account, while a locked-out person is inconvenienced, not signed out.
 */
export const USERNAME_POLICY: ThrottlePolicy = {
	limit: 5,
	windowMs: 15 * MINUTE_MS,
	baseLockMs: MINUTE_MS,
	maxLockMs: 15 * MINUTE_MS
};

/**
 * The address ceiling is high on purpose: a household shares one public address,
 * so several devices failing at once must not lock the front door. It is sized
 * to catch spraying (hundreds of attempts), not forgetfulness.
 */
export const ADDRESS_POLICY: ThrottlePolicy = {
	limit: 50,
	windowMs: 15 * MINUTE_MS,
	baseLockMs: MINUTE_MS,
	maxLockMs: 15 * MINUTE_MS
};

/**
 * Registration counts every attempt from one address, not only the failures:
 * every attempt spends the same scrypt derivation, and `taken` is the only thing
 * this system says about who exists. The address is the only identity an
 * unregistered caller has. Ten in an hour is more accounts than a household
 * has, so the eleventh waits a minute, doubling to a quarter of an hour.
 */
export const REGISTRATION_POLICY: ThrottlePolicy = {
	limit: 10,
	windowMs: 60 * MINUTE_MS,
	baseLockMs: MINUTE_MS,
	maxLockMs: 15 * MINUTE_MS
};

/** Who is attempting to sign in, as the request presents it. */
export type SignInAttempt = {
	username: string;
	/** `null` when the deployment cannot determine one; the address scope is then skipped. */
	clientAddress: string | null;
};

export type ThrottleDecision =
	{ allowed: true } | { allowed: false; scope: ThrottleScope; retryAfterMs: number };

type Bucket = { scope: ThrottleScope; keyHash: string; policy: ThrottlePolicy };
type BucketState = { failures: number; windowEndsAt: string; lockedUntil: string | null };
type Lock = { scope: ThrottleScope; remainingMs: number };

/** This runs on unauthenticated input: bound it before normalizing or hashing. */
const MAX_KEY_LENGTH = 128;

/**
 * The key is hashed, so the table is not a list of tried usernames and one
 * hostile address cannot store a megabyte. The scope is inside the hash so the
 * counters cannot collide.
 */
function keyHash(scope: ThrottleScope, value: string): string {
	// The separator is an escape, not a literal NUL byte: one in the source makes
	// Git treat this file as binary, hiding it from the changed-line lanes.
	return createHash('sha256').update(`${scope}\u0000${value}`).digest('hex');
}

function bucketsFor(attempt: SignInAttempt): Bucket[] {
	const username = normalizeUsername(attempt.username.slice(0, MAX_KEY_LENGTH));
	const buckets: Bucket[] = [
		{ scope: 'username', keyHash: keyHash('username', username), policy: USERNAME_POLICY }
	];
	const address = attempt.clientAddress?.slice(0, MAX_KEY_LENGTH);
	if (address) {
		buckets.push({
			scope: 'address',
			keyHash: keyHash('address', address),
			policy: ADDRESS_POLICY
		});
	}
	return buckets;
}

function readState(db: DatabaseSync, bucket: Bucket): BucketState | null {
	const row = db
		.prepare(
			`select failures, window_ends_at, locked_until
			 from sign_in_throttle
			 where scope = ? and key_hash = ?`
		)
		.get(bucket.scope, bucket.keyHash);
	if (!row) return null;
	const lockedUntil = row['locked_until'];
	return {
		failures: integer(row, 'failures'),
		windowEndsAt: text(row, 'window_ends_at'),
		lockedUntil: typeof lockedUntil === 'string' ? lockedUntil : null
	};
}

function writeState(db: DatabaseSync, bucket: Bucket, state: BucketState): void {
	db.prepare(
		`insert into sign_in_throttle (scope, key_hash, failures, window_ends_at, locked_until)
		 values (?, ?, ?, ?, ?)
		 on conflict (scope, key_hash) do update set
		   failures = excluded.failures,
		   window_ends_at = excluded.window_ends_at,
		   locked_until = excluded.locked_until`
	).run(bucket.scope, bucket.keyHash, state.failures, state.windowEndsAt, state.lockedUntil);
}

/**
 * The state one more failure leaves behind. Because `maxLockMs` never exceeds
 * `windowMs`, a lock always ends no later than its window, so `prune` can drop a
 * row on its window alone and an expired window resets the count without ever
 * cutting a live lock short.
 */
function advance(state: BucketState | null, policy: ThrottlePolicy, now: Date): BucketState {
	const stamp = now.toISOString();
	// Both sides are same-width UTC ISO-8601, so this is a string comparison on purpose.
	const carried = state !== null && state.windowEndsAt > stamp ? state.failures : 0;
	const failures = carried + 1;
	const excess = failures - policy.limit;
	const lockMs = excess < 0 ? 0 : Math.min(policy.baseLockMs * 2 ** excess, policy.maxLockMs);
	return {
		failures,
		windowEndsAt: new Date(now.getTime() + policy.windowMs).toISOString(),
		lockedUntil: lockMs === 0 ? null : new Date(now.getTime() + lockMs).toISOString()
	};
}

function remainingLockMs(state: BucketState | null, now: Date): number {
	if (state === null || state.lockedUntil === null) return 0;
	return Math.max(0, new Date(state.lockedUntil).getTime() - now.getTime());
}

/** The longest wait any scope imposes, so a caller is never told to retry early. */
function longestLock(locks: Lock[]): ThrottleDecision {
	let worst: Lock | null = null;
	for (const lock of locks) {
		if (lock.remainingMs > 0 && (worst === null || lock.remainingMs > worst.remainingMs)) {
			worst = lock;
		}
	}
	if (worst === null) return { allowed: true };
	return { allowed: false, scope: worst.scope, retryAfterMs: worst.remainingMs };
}

/**
 * Whether this attempt may be verified at all. Called before the password is
 * checked, so a locked attempt costs a hash lookup, not a derivation. The lock
 * is a function of the caller's own previous attempts, so it reveals nothing.
 */
export function checkSignIn(
	db: DatabaseSync,
	attempt: SignInAttempt,
	now = new Date()
): ThrottleDecision {
	const locks = bucketsFor(attempt).map((bucket) => ({
		scope: bucket.scope,
		remainingMs: remainingLockMs(readState(db, bucket), now)
	}));
	return longestLock(locks);
}

/** Count one failed attempt against every scope, and report the wait it now carries. */
export function recordFailedSignIn(
	db: DatabaseSync,
	attempt: SignInAttempt,
	now = new Date()
): ThrottleDecision {
	const locks = bucketsFor(attempt).map((bucket) => {
		const state = advance(readState(db, bucket), bucket.policy, now);
		writeState(db, bucket, state);
		return { scope: bucket.scope, remainingMs: remainingLockMs(state, now) };
	});
	// Swept here rather than on a timer: writing is the only moment this table grows.
	pruneSignInThrottle(db, now);
	return longestLock(locks);
}

/**
 * Forget an account's failures after it has proved the password. Only the
 * username scope is cleared: a successful sign-in must not let an attacker reset
 * an address that is halfway to a spray lockout.
 */
export function clearSignInFailures(db: DatabaseSync, username: string): void {
	db.prepare('delete from sign_in_throttle where scope = ? and key_hash = ?').run(
		'username',
		keyHash('username', normalizeUsername(username.slice(0, MAX_KEY_LENGTH)))
	);
}

/**
 * The bucket a registration attempt is counted in, or `null` when the deployment
 * cannot determine an address. There is no fallback scope: counting against the
 * submitted username would let a caller hold a name it does not own out of ever
 * being registered, and answer "is this name taken" from the throttle.
 */
function registrationBucket(clientAddress: string | null): Bucket | null {
	const address = clientAddress?.slice(0, MAX_KEY_LENGTH);
	if (!address) return null;
	return {
		scope: 'registration',
		keyHash: keyHash('registration', address),
		policy: REGISTRATION_POLICY
	};
}

/**
 * Whether this address may pay for another registration's derivation. Called
 * before the account is created, so a refused attempt costs a hash lookup, not a
 * derivation.
 */
export function checkRegistration(
	db: DatabaseSync,
	clientAddress: string | null,
	now = new Date()
): ThrottleDecision {
	const bucket = registrationBucket(clientAddress);
	if (bucket === null) return { allowed: true };
	return longestLock([
		{ scope: bucket.scope, remainingMs: remainingLockMs(readState(db, bucket), now) }
	]);
}

/**
 * Count one registration attempt, whatever it goes on to answer. Recorded before
 * the account is created, so an attempt that ends in `username-taken` costs the
 * caller as much of its allowance as one that ends in an account.
 */
export function recordRegistration(
	db: DatabaseSync,
	clientAddress: string | null,
	now = new Date()
): ThrottleDecision {
	const bucket = registrationBucket(clientAddress);
	if (bucket === null) return { allowed: true };
	const state = advance(readState(db, bucket), bucket.policy, now);
	writeState(db, bucket, state);
	// Swept on the write, the same as a failed sign-in: this is the only moment the table grows.
	pruneSignInThrottle(db, now);
	return longestLock([{ scope: bucket.scope, remainingMs: remainingLockMs(state, now) }]);
}

/** Drop the rows whose window has closed and whose lock has run out. */
export function pruneSignInThrottle(db: DatabaseSync, now = new Date()): number {
	const stamp = now.toISOString();
	const result = db
		.prepare(
			`delete from sign_in_throttle
			 where window_ends_at <= ? and (locked_until is null or locked_until <= ?)`
		)
		.run(stamp, stamp);
	return Number(result.changes);
}
