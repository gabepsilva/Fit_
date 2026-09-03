import type { AuthErrorCode, AuthFailure } from './api';

/**
 * The sentences the endpoints deliberately do not write: the server answers a
 * code, and this module owns the wording, so two forms cannot drift apart.
 * The limits mirror the server's and are repeated, not imported —
 * `src/lib/server/` never reaches the browser; its tests keep the two honest.
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

/** How long to wait, in words: seconds while short, whole minutes after. */
export function waitWording(seconds: number): string {
	if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
	const minutes = Math.ceil(seconds / 60);
	return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/** Whole-submission codes; the exhaustive record makes a missing one a type error. */
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
 * The message above a form, for failures of the whole submission rather than
 * one field. `too-many-attempts` is a fallback only: the sign-in page counts
 * the wait down itself, so a rendered sentence would go stale.
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
 * The endpoints answer one problem at a time, so a form shows one too: a
 * rejected field goes under that field, everything else above the form.
 * `username-taken` is the exception and goes under the username.
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
