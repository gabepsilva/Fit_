import { describe, expect, it } from 'vitest';
import { failureWording, fieldWording, placeFailure, waitWording } from './wording';

describe('fieldWording', () => {
	it('says how short a username may be', () => {
		expect(fieldWording('username', 'too-short')).toBe('At least 3 characters.');
	});

	it('says which characters a username may hold', () => {
		expect(fieldWording('username', 'unsupported-characters')).toContain('Letters, digits');
	});

	it('says how long a password has to be', () => {
		expect(fieldWording('password', 'too-short')).toBe('At least 10 characters.');
	});

	it('describes an invisible character in a stored name without naming code points', () => {
		expect(fieldWording('displayName', 'unsafe-characters')).toBe(
			'Remove any invisible or control characters.'
		);
	});

	it('says how long a username may be', () => {
		expect(fieldWording('username', 'too-long')).toBe('At most 32 characters.');
	});

	it('caps a password at the length the server stores', () => {
		expect(fieldWording('password', 'too-long')).toBe('At most 128 characters.');
	});

	it('caps a display name at the length the server stores', () => {
		expect(fieldWording('displayName', 'too-long')).toBe('At most 100 characters.');
	});

	it('caps a household name at the same length as a display name', () => {
		expect(fieldWording('householdName', 'too-long')).toBe('At most 100 characters.');
	});

	it('describes an invisible character in a household name', () => {
		expect(fieldWording('householdName', 'unsafe-characters')).toBe(
			'Remove any invisible or control characters.'
		);
	});

	it('falls back rather than showing a bare code for a reason it does not know', () => {
		expect(fieldWording('username', 'reversed')).toBe('That value can’t be used.');
	});

	it('falls back for a field it does not know', () => {
		expect(fieldWording('nickname', 'too-long')).toBe('That value can’t be used.');
	});

	it('falls back when no reason came back at all', () => {
		expect(fieldWording('password', undefined)).toBe('That value can’t be used.');
	});
});

describe('waitWording', () => {
	it('counts a single second in the singular', () => {
		expect(waitWording(1)).toBe('1 second');
	});

	it('counts seconds while the wait is short', () => {
		expect(waitWording(45)).toBe('45 seconds');
	});

	it('turns a longer wait into minutes', () => {
		expect(waitWording(154)).toBe('3 minutes');
	});

	it('rounds a wait up, so nobody comes back early and is refused again', () => {
		expect(waitWording(61)).toBe('2 minutes');
	});

	it('counts a single minute in the singular', () => {
		expect(waitWording(60)).toBe('1 minute');
	});
});

describe('failureWording', () => {
	it('says the same thing for a wrong name as for a wrong password', () => {
		expect(failureWording({ code: 'invalid-credentials' })).toBe(
			'That username and password don’t match.'
		);
	});

	it('says a username is taken', () => {
		expect(failureWording({ code: 'username-taken' })).toBe('That username is taken.');
	});

	it('describes a rejected field by its own reason', () => {
		expect(failureWording({ code: 'invalid-input', field: 'password', reason: 'too-short' })).toBe(
			'At least 10 characters.'
		);
	});

	it('tells someone how long the throttle is holding them', () => {
		expect(failureWording({ code: 'too-many-attempts', retryAfterSeconds: 30 })).toContain(
			'30 seconds'
		);
	});

	it('still says something useful when the throttle sent no header', () => {
		expect(failureWording({ code: 'too-many-attempts' })).toBe(
			'Too many attempts. Try again shortly.'
		);
	});

	it('separates a connection that failed from a credential that was refused', () => {
		expect(failureWording({ code: 'unreachable' })).toContain('Couldn’t reach the server');
	});

	it('has a sentence for an origin the server refused', () => {
		expect(failureWording({ code: 'forbidden-origin' })).toContain('refused');
	});

	it('has a sentence for a body that did not arrive intact', () => {
		expect(failureWording({ code: 'invalid-body' })).toContain('intact');
	});

	it('says nothing is signed in when the server refuses an anonymous request', () => {
		expect(failureWording({ code: 'unauthenticated' })).toBe('Nothing is signed in here.');
	});
});

describe('placeFailure', () => {
	it('puts a rejected field under that field', () => {
		expect(placeFailure({ code: 'invalid-input', field: 'username', reason: 'too-short' })).toEqual(
			{ field: 'username', message: 'At least 3 characters.' }
		);
	});

	it('puts a taken username under the username, where the correction is made', () => {
		expect(placeFailure({ code: 'username-taken' })).toEqual({
			field: 'username',
			message: 'That username is taken.'
		});
	});

	it('still says a username is taken when the server names the field too', () => {
		// The endpoint answers `username-taken` with `field: 'username'`, so the
		// field alone does not decide the branch: reading it first would send this
		// through the rejected-input wording and lose the one sentence that says
		// what actually happened.
		expect(placeFailure({ code: 'username-taken', field: 'username' })).toEqual({
			field: 'username',
			message: 'That username is taken.'
		});
	});

	it('puts a refused credential above the form, naming neither box', () => {
		expect(placeFailure({ code: 'invalid-credentials' }).field).toBeNull();
	});

	it('puts a throttled attempt above the form', () => {
		expect(placeFailure({ code: 'too-many-attempts', retryAfterSeconds: 5 }).field).toBeNull();
	});

	it('puts an unusable input above the form when the server named no field', () => {
		expect(placeFailure({ code: 'invalid-input' }).field).toBeNull();
	});
});
