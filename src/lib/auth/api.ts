import { resolve } from '$app/paths';

/**
 * The browser's side of the authentication endpoints. `fetch`, not form actions:
 * the endpoints only take `application/json`, and the Capacitor build is
 * `adapter-static`, where form actions do not exist.
 *
 * Same-origin only: the `Origin` check in `hooks.server.ts` sees the page's own
 * origin, and nothing sends `x-fit-session`, so the web client gets the
 * `HttpOnly` cookie and never a token.
 */

/** The account as the endpoints hand it back. No hash, no token. */
export type SessionAccount = {
	id: string;
	username: string;
	displayName: string;
	createdAt: string;
};

export type SessionHousehold = {
	householdId: string;
	name: string;
	role: 'owner' | 'member';
};

export type SignedInSession = {
	account: SessionAccount;
	households: SessionHousehold[];
	expiresAt: string;
};

/**
 * Every code the endpoints answer with, plus `unreachable` for a request that
 * never reached them: a dropped connection is not a rejected credential.
 */
export type AuthErrorCode =
	| 'invalid-body'
	| 'invalid-input'
	| 'invalid-credentials'
	| 'unauthenticated'
	| 'forbidden-origin'
	| 'username-taken'
	| 'too-many-attempts'
	| 'unreachable';

export type AuthFailure = {
	code: AuthErrorCode;
	/** Which submitted field was rejected, for `invalid-input`. */
	field?: string | undefined;
	/** Why it was rejected: `too-short`, `unsupported-characters`, and so on. */
	reason?: string | undefined;
	/** Whole seconds from `Retry-After`, for `too-many-attempts`. */
	retryAfterSeconds?: number | undefined;
};

export type AuthResult<T> = { ok: true; value: T } | { ok: false; failure: AuthFailure };

/**
 * What a sign-up form submits. The session's device label is not among them:
 * the server derives it from the request's own `User-Agent`, so there is
 * nothing for a form to ask.
 */
export type Registration = {
	username: string;
	displayName: string;
	password: string;
	householdName: string;
};

export type Credentials = {
	username: string;
	password: string;
};

const CODES = new Set<string>([
	'invalid-body',
	'invalid-input',
	'invalid-credentials',
	'unauthenticated',
	'forbidden-origin',
	'username-taken',
	'too-many-attempts'
]);

function codeOf(body: unknown): AuthErrorCode {
	if (typeof body !== 'object' || body === null) return 'invalid-body';
	const error = (body as { error?: unknown }).error;
	if (typeof error !== 'object' || error === null) return 'invalid-body';
	const code = (error as { code?: unknown }).code;
	return typeof code === 'string' && CODES.has(code) ? (code as AuthErrorCode) : 'invalid-body';
}

function textOf(body: unknown, key: 'field' | 'reason'): string | undefined {
	// The body may be `null` or non-JSON: a malformed answer must not throw.
	const error = (body as { error?: Record<string, unknown> } | null)?.error;
	const value = error?.[key];
	return typeof value === 'string' ? value : undefined;
}

/**
 * `Retry-After` in whole seconds, or `undefined` when missing or not a positive
 * whole second: this endpoint sends seconds, so anything else is not its answer.
 */
export function retryAfterSeconds(headers: Headers): number | undefined {
	const seconds = Number(headers.get('retry-after'));
	return Number.isInteger(seconds) && seconds > 0 ? seconds : undefined;
}

async function failureOf(response: Response): Promise<AuthFailure> {
	const body: unknown = await response.json().catch(() => null);
	const code = codeOf(body);
	return {
		code,
		field: textOf(body, 'field'),
		reason: textOf(body, 'reason'),
		retryAfterSeconds: retryAfterSeconds(response.headers)
	};
}

const UNREACHABLE: AuthFailure = { code: 'unreachable' };

type Sent = { path: string; method: 'GET' | 'POST' | 'DELETE'; body?: Record<string, string> };

/** `credentials` stays at the default, which carries the session cookie. */
async function send(sent: Sent): Promise<Response | null> {
	const init: RequestInit =
		sent.body === undefined
			? { method: sent.method }
			: {
					method: sent.method,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(sent.body)
				};
	try {
		return await fetch(sent.path, init);
	} catch {
		// A dropped connection is not a rejection; `null` keeps the two apart.
		return null;
	}
}

async function sessionFrom(response: Response): Promise<AuthResult<SignedInSession>> {
	if (!response.ok) return { ok: false, failure: await failureOf(response) };
	const value: unknown = await response.json().catch(() => null);
	if (typeof value !== 'object' || value === null) return { ok: false, failure: UNREACHABLE };
	return { ok: true, value: value as SignedInSession };
}

/** Register: the account, the household it owns and its profile, then signed in. */
export async function register(input: Registration): Promise<AuthResult<SignedInSession>> {
	const response = await send({
		path: resolve('/api/accounts'),
		method: 'POST',
		body: input
	});
	return response === null ? { ok: false, failure: UNREACHABLE } : sessionFrom(response);
}

export async function signIn(input: Credentials): Promise<AuthResult<SignedInSession>> {
	const response = await send({
		path: resolve('/api/sessions'),
		method: 'POST',
		body: input
	});
	return response === null ? { ok: false, failure: UNREACHABLE } : sessionFrom(response);
}

/**
 * What the server says this device's session is. A 401 is a definitive
 * "signed out"; a dropped request is `unreachable` and means nothing was
 * learned — the store keeps those apart.
 */
export async function currentSession(): Promise<AuthResult<SignedInSession>> {
	const response = await send({ path: resolve('/api/sessions/current'), method: 'GET' });
	return response === null ? { ok: false, failure: UNREACHABLE } : sessionFrom(response);
}

async function ended(sent: Sent): Promise<AuthResult<null>> {
	const response = await send(sent);
	if (response === null) return { ok: false, failure: UNREACHABLE };
	if (!response.ok) return { ok: false, failure: await failureOf(response) };
	return { ok: true, value: null };
}

/** End this device's session. Idempotent: the endpoint answers 204 either way. */
export function signOut(): Promise<AuthResult<null>> {
	return ended({ path: resolve('/api/sessions/current'), method: 'DELETE' });
}

/** End every session the account holds, this one included. */
export function signOutEverywhere(): Promise<AuthResult<null>> {
	return ended({ path: resolve('/api/sessions'), method: 'DELETE' });
}
