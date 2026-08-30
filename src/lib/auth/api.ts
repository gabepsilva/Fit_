import { resolve } from '$app/paths';

/**
 * The browser's side of the authentication endpoints.
 *
 * Client `fetch` rather than form actions, and the reasons are structural
 * rather than taste. The endpoints already exist and take JSON — `readTextBody`
 * refuses anything that is not `application/json`, which is exactly what a
 * form-encoded post from a form action would send, so an action could not call
 * them and would have to be a second implementation of the same rules. The app
 * also sets `ssr = false`, so there is no no-JavaScript path for progressive
 * enhancement to protect, and the Capacitor build is `adapter-static`, where
 * form actions do not exist at all. One request path serves both builds.
 *
 * The origin policy in `hooks.server.ts` is satisfied by this on purpose, not
 * by accident: browsers attach `Origin` to every non-safe same-origin request,
 * and `checkOrigin` compares it against `url.origin` when nothing is
 * configured. Nothing here sends the `x-fit-session` header, so the web client
 * is answered with the `HttpOnly` cookie and never a token it could leak.
 */

/** The account as the endpoints hand it back. No hash, no token. */
export type SessionAccount = {
	id: string;
	username: string;
	displayName: string;
	createdAt: string;
};

/** A household the account belongs to, and what it may do there. */
export type SessionHousehold = {
	householdId: string;
	name: string;
	role: 'owner' | 'member';
};

/** What a successful sign-in or registration answers with. */
export type SignedInSession = {
	account: SessionAccount;
	households: SessionHousehold[];
	expiresAt: string;
};

/**
 * Every code the endpoints answer with, plus `unreachable` for the one failure
 * that never reaches them. A network that dropped the request is a different
 * thing to tell someone than a password that was wrong, and collapsing the two
 * would have a flaky connection read as a rejected credential.
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

/** What a sign-up form submits. `deviceLabel` names the device in a session list. */
export type Registration = {
	username: string;
	displayName: string;
	password: string;
	householdName: string;
	deviceLabel?: string | undefined;
};

/** What a sign-in form submits. */
export type Credentials = {
	username: string;
	password: string;
	deviceLabel?: string | undefined;
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
	const error = (body as { error?: Record<string, unknown> }).error;
	const value = error?.[key];
	return typeof value === 'string' ? value : undefined;
}

/**
 * `Retry-After` in whole seconds, or `undefined` when the header is missing or
 * unusable. The endpoint sends seconds and never zero; anything else came from
 * something that is not this server, and guessing a number for it would tell
 * someone to wait for a length nobody promised.
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

type Sent = { path: string; method: 'POST' | 'DELETE'; body?: Record<string, string> };

/**
 * The one request these four calls make. `credentials` is left at the default,
 * which is `same-origin` — the session cookie is set and sent by the browser,
 * and nothing here has to know it exists.
 */
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
		// A dropped connection, a stopped server, a WebView with no host. None of
		// those are a rejection, and the caller is told so.
		return null;
	}
}

async function sessionFrom(response: Response): Promise<AuthResult<SignedInSession>> {
	if (!response.ok) return { ok: false, failure: await failureOf(response) };
	const value: unknown = await response.json().catch(() => null);
	if (typeof value !== 'object' || value === null) return { ok: false, failure: UNREACHABLE };
	return { ok: true, value: value as SignedInSession };
}

/** Every value the endpoints read is text, so a body carrying anything else is malformed. */
function fields(input: Record<string, string | undefined>): Record<string, string> {
	const body: Record<string, string> = {};
	for (const [name, value] of Object.entries(input)) {
		if (value !== undefined) body[name] = value;
	}
	return body;
}

/** Register: the account, the household it owns and its profile, then signed in. */
export async function register(input: Registration): Promise<AuthResult<SignedInSession>> {
	const response = await send({
		path: resolve('/api/accounts'),
		method: 'POST',
		body: fields({ ...input })
	});
	return response === null ? { ok: false, failure: UNREACHABLE } : sessionFrom(response);
}

/** Sign in and start a session on this device. */
export async function signIn(input: Credentials): Promise<AuthResult<SignedInSession>> {
	const response = await send({
		path: resolve('/api/sessions'),
		method: 'POST',
		body: fields({ ...input })
	});
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
