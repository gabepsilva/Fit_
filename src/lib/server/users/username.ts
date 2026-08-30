/** Why a username was rejected. Codes rather than sentences, so the interface owns the wording. */
export type UsernameProblem = 'too-short' | 'too-long' | 'unsupported-characters';

const MIN_LENGTH = 3;
const MAX_LENGTH = 32;

/** Bound untrusted input before Unicode normalization can allocate an expanded string. */
const MAX_RAW_USERNAME_LENGTH = 128;

/**
 * ASCII letters, digits, and the three separators people actually type. The
 * restriction is deliberate: a name spelled with a Cyrillic о is a
 * different string from the same name spelled with an ASCII `o`, and renders
 * identically. With the username as the only identifier, letting both exist
 * would make one account impersonate another on sight.
 */
const ALLOWED = /^[a-z0-9][a-z0-9._-]*$/;

/**
 * The stored form of a username. NFKC first so that visually-identical
 * compatibility forms collapse before the comparison, then lowercase, so
 * `Jordan` and `jordan` cannot both be registered.
 */
export function normalizeUsername(username: string): string {
	return username.normalize('NFKC').trim().toLowerCase();
}

/** `null` when the normalized username is usable, otherwise the reason it is not. */
export function usernameProblem(username: string): UsernameProblem | null {
	if (username.length > MAX_RAW_USERNAME_LENGTH) return 'too-long';
	const normalized = normalizeUsername(username);
	if (normalized.length < MIN_LENGTH) return 'too-short';
	if (normalized.length > MAX_LENGTH) return 'too-long';
	if (!ALLOWED.test(normalized)) return 'unsupported-characters';
	return null;
}
