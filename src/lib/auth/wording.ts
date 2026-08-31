import type { AuthErrorCode, AuthFailure } from './api';

/**
 * The sentences the endpoints deliberately do not write.
 *
 * `src/lib/server/api.ts` answers a code rather than a message, on the stated
 * grounds that the interface owns the wording. This is that interface. Keeping
 * the mapping in one module rather than inside two forms is what stops the
 * sign-in page and the sign-up page from describing the same rejection
 * differently.
 *
 * The numbers here mirror the server's own limits — a username is 3 to 32
 * characters, a password at least 10, a stored name at most 100. They are
 * repeated rather than imported because `src/lib/server/` never reaches the
 * browser; the tests beside the server modules are what keep the two honest.
 */

/** The sentence under a field the server rejected, keyed by field then reason. */
const FIELD_WORDING: Record<string, Record<string, string>> = {
	username: {
		'too-short': 'At least 3 characters.',
		'too-long': 'At most 32 characters.',
		'unsupported-characters': 'Letters, digits, and . _ - only.',
		taken: 'That username is taken.'
	},
	password: {
		'too-short': 'At least 10 characters.',
		'too-long': 'At most 128 characters.'
	},
	displayName: {
		'too-long': 'At most 100 characters.',
		'unsafe-characters': 'Remove any invisible or control characters.'
	},
	householdName: {
		'too-long': 'At most 100 characters.',
		'unsafe-characters': 'Remove any invisible or control characters.'
	},
	deviceLabel: {
		'too-long': 'At most 100 characters.',
		'unsafe-characters': 'Remove any invisible or control characters.'
	}
};

const UNRECOGNIZED_FIELD = 'That value can’t be used.';

/** What to say under a rejected field. Falls back rather than showing a bare code. */
export function fieldWording(field: string, reason: string | undefined): string {
	return FIELD_WORDING[field]?.[reason ?? ''] ?? UNRECOGNIZED_FIELD;
}

/**
 * How long to wait, in words. Seconds while it is short enough to sit through,
 * whole minutes after that — "in 154 seconds" is a number to do arithmetic on
 * rather than a wait to understand.
 */
export function waitWording(seconds: number): string {
	if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
	const minutes = Math.ceil(seconds / 60);
	return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * Every code that describes the whole submission. Typed as an exhaustive record
 * rather than a loose lookup with a fallback, so a code added to the endpoints
 * fails the type check here instead of quietly reaching someone as a shrug.
 */
const CODE_WORDING: Record<
	Exclude<AuthErrorCode, 'invalid-input' | 'too-many-attempts'>,
	string
> = {
	'invalid-credentials': 'That username and password don’t match.',
	'username-taken': 'That username is taken.',
	unauthenticated: 'Nothing is signed in here.',
	'forbidden-origin': 'The server refused a request from this address.',
	'invalid-body': 'That didn’t reach the server intact. Try again.',
	unreachable: 'Couldn’t reach the server. Check your connection and try again.'
};

/**
 * The message shown above a form, for failures that belong to the whole
 * submission rather than to one field.
 *
 * `too-many-attempts` is answered here as a fallback only. The sign-in page
 * counts the wait down against its own clock, because a sentence rendered once
 * would still say "in 60 seconds" a minute later.
 */
export function failureWording(failure: AuthFailure): string {
	if (failure.code === 'invalid-input') {
		return fieldWording(failure.field ?? '', failure.reason);
	}
	if (failure.code === 'too-many-attempts') {
		const seconds = failure.retryAfterSeconds;
		return seconds === undefined
			? 'Too many attempts. Try again shortly.'
			: `Too many attempts. Try again in ${waitWording(seconds)}.`;
	}
	return CODE_WORDING[failure.code];
}

/** Where a failure belongs on a form: under one named field, or above all of them. */
export type FormProblem = { field: string | null; message: string };

/**
 * Put a failure where the person can act on it.
 *
 * The endpoints answer one problem at a time — `registrationProblem` returns
 * the first thing wrong and stops — so a form shows one too, rather than
 * inventing a list the server never sent. A rejected field gets the message
 * under that field, where the correction is made; everything else belongs above
 * the form, because it is about the submission rather than a box in it.
 *
 * `username-taken` is the exception that proves the rule: it is a distinct code
 * with its own status, but to someone filling in a form it is a problem with
 * the username box, so that is where it goes.
 */
export function placeFailure(failure: AuthFailure): FormProblem {
	if (failure.code === 'invalid-input' && failure.field !== undefined) {
		return { field: failure.field, message: fieldWording(failure.field, failure.reason) };
	}
	if (failure.code === 'username-taken') {
		return { field: 'username', message: fieldWording('username', 'taken') };
	}
	return { field: null, message: failureWording(failure) };
}
