import { json } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import type { DatabaseSync } from 'node:sqlite';
import { apiError, readTextBody } from './api';
import { clientAddressFor } from './client-address';
import { sessionTokenFrom } from './request-auth';
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from './session-cookie';
import type { SessionCookieWriter } from './session-cookie';
import { authenticate, membershipsFor, registerAccount } from './users/accounts';
import { storedTextProblem } from './users/input';
import { OWASP_SCRYPT } from './users/password';
import type { ScryptCost } from './users/password';
import {
	createSession,
	endAllSessions,
	endSession,
	MAX_DEVICE_LABEL_LENGTH
} from './users/sessions';
import { checkSignIn, clearSignInFailures, recordFailedSignIn } from './users/throttle';
import type { Account } from './users/types';

/**
 * The public authentication endpoints.
 *
 * The handlers live here rather than in `+server.ts` because `src/lib/server/`
 * is what the `server` vitest project measures and mutates; a route file that
 * held logic would be tested by nothing. Each route is a one-line wrapper that
 * supplies the process-wide database, and everything below takes it as an
 * argument so a spec can hand it an in-memory one.
 */

/**
 * The part of SvelteKit's `RequestEvent` these handlers use. Narrow on purpose:
 * a spec can build one without standing up a framework, and nothing here can
 * quietly start depending on the rest of the event.
 */
export type AuthEvent = {
	request: Request;
	url: URL;
	cookies: SessionCookieWriter & Pick<Cookies, 'get'>;
	locals: App.Locals;
	getClientAddress: () => string;
};

/**
 * How the client wants its session back.
 *
 * The web build gets the `HttpOnly` cookie and no token in the body — putting
 * it there as well would hand any script on the page the very credential the
 * flag exists to keep from it, and one that outlives the page by ninety days.
 * The Capacitor build has no usable cookie jar for a remote origin and asks for
 * the token instead, which it then sends as `Authorization: Bearer`. One
 * client, one credential: a request never carries both.
 */
export const SESSION_DELIVERY_HEADER = 'x-fit-session';

const BEARER_DELIVERY = 'bearer';

function wantsBearerSession(request: Request): boolean {
	return request.headers.get(SESSION_DELIVERY_HEADER)?.trim().toLowerCase() === BEARER_DELIVERY;
}

/** What both endpoints read off a body once it has been proved to be one. */
type Submission = { fields: Record<string, string>; deviceLabel: string | null };

type SubmissionResult = { ok: true; submission: Submission } | { ok: false; response: Response };

/**
 * The device label is validated here, before an account is created rather than
 * after. `createSession` would refuse it either way, but by then registration
 * has already committed four rows, and the caller would get a 400 for an
 * account that exists.
 */
async function readSubmission(request: Request): Promise<SubmissionResult> {
	const fields = await readTextBody(request);
	if (fields === null) return { ok: false, response: apiError('invalid-body') };
	const deviceLabel = fields['deviceLabel'] ?? null;
	const problem =
		deviceLabel === null
			? null
			: storedTextProblem(deviceLabel, 'deviceLabel', MAX_DEVICE_LABEL_LENGTH);
	if (problem) {
		return {
			ok: false,
			response: apiError('invalid-input', { field: problem.field, reason: problem.code })
		};
	}
	return { ok: true, submission: { fields, deviceLabel } };
}

type IssueOptions = { deviceLabel: string | null; status: number };

/**
 * Start a session and answer with it.
 *
 * `households` is in the body because `household_id` is the predicate every
 * later read filters on, so a client that has just signed in and does not know
 * its household has nothing it can ask for. `expiresAt` is there so a client
 * knows when to stop trusting what it holds without decoding anything.
 */
function establishSession(
	db: DatabaseSync,
	event: AuthEvent,
	account: Account,
	options: IssueOptions
): Response {
	const { token, session } = createSession(db, account.id, options.deviceLabel);
	const body = {
		account,
		households: membershipsFor(db, account.id),
		expiresAt: session.expiresAt
	};
	if (wantsBearerSession(event.request)) {
		return json({ ...body, token }, { status: options.status });
	}
	setSessionCookie(event.cookies, event.url, { token, expiresAt: session.expiresAt });
	return json(body, { status: options.status });
}

/**
 * Registration is the one place that necessarily answers "does this username
 * exist": a sign-up form that cannot say a name is taken is not one. Sign-in
 * says nothing of the sort, and that is the property that matters — an attacker
 * learning a name is registered still has to guess the password, while one who
 * can tell a wrong name from a wrong password has halved the problem.
 */
function registrationError(problem: { field: string; code: string }): Response {
	if (problem.code === 'taken') return apiError('username-taken', { field: problem.field });
	return apiError('invalid-input', { field: problem.field, reason: problem.code });
}

/**
 * Create an account, the household it owns and its own profile, then sign it
 * in. The four rows go in one transaction inside `registerAccount`; this only
 * decides what the caller is told about it.
 *
 * `cost` is injected the way `registerAccount` takes one, because a spec that
 * hashed at the production cost would spend a third of a second per case.
 */
export async function register(
	db: DatabaseSync,
	event: AuthEvent,
	cost: ScryptCost = OWASP_SCRYPT
): Promise<Response> {
	const submission = await readSubmission(event.request);
	if (!submission.ok) return submission.response;
	const { fields, deviceLabel } = submission.submission;
	const result = await registerAccount(
		db,
		{
			username: fields['username'] ?? '',
			displayName: fields['displayName'] ?? '',
			password: fields['password'] ?? '',
			householdName: fields['householdName'] ?? ''
		},
		cost
	);
	if (!result.ok) return registrationError(result.problem);
	return establishSession(db, event, result.account, { deviceLabel, status: 201 });
}

/**
 * `Retry-After` is whole seconds and never zero: a client told to wait must
 * have something to wait for, and rounding up keeps it from returning early
 * only to be refused again.
 */
function tooManyAttempts(retryAfterMs: number): Response {
	const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
	return apiError('too-many-attempts', {}, { 'retry-after': String(seconds) });
}

/**
 * Sign in, in the order the throttle requires.
 *
 * `checkSignIn` runs before `authenticate` so a locked attempt costs a hash
 * lookup instead of 350 ms of scrypt — which is what stops the endpoint from
 * being a way to spend the server's CPU. The failure is counted before the
 * answer is written, and cleared only once the password has actually been
 * proved.
 *
 * Every failure answers `invalid-credentials` and nothing else. An unknown
 * username, a wrong password and a malformed one are the same status, the same
 * body and — because `authenticate` verifies against a decoy hash when no
 * account matches — near enough the same duration. The username is the only
 * identifier this system has, so a caller who could tell those apart would have
 * halved the problem before guessing anything.
 *
 * A lockout is not an oracle either: the throttle keys on the username as it
 * was submitted, existing or not, so being told to wait says only what the
 * caller has already done.
 */
export async function signIn(
	db: DatabaseSync,
	event: AuthEvent,
	cost: ScryptCost = OWASP_SCRYPT
): Promise<Response> {
	const submission = await readSubmission(event.request);
	if (!submission.ok) return submission.response;
	const { fields, deviceLabel } = submission.submission;
	const attempt = {
		username: fields['username'] ?? '',
		clientAddress: clientAddressFor(event.request, event.getClientAddress)
	};
	const decision = checkSignIn(db, attempt);
	if (!decision.allowed) return tooManyAttempts(decision.retryAfterMs);
	const account = await authenticate(db, attempt.username, fields['password'] ?? '', { cost });
	if (account === null) {
		recordFailedSignIn(db, attempt);
		return apiError('invalid-credentials');
	}
	clearSignInFailures(db, attempt.username);
	return establishSession(db, event, account, { deviceLabel, status: 200 });
}

/** Nothing is left to say once a session is gone, and no body means none to leak. */
function signedOut(): Response {
	return new Response(null, { status: 204 });
}

/**
 * End the session this request presented, and remove the cookie carrying it.
 *
 * The credential is read with `sessionTokenFrom`, the same resolver the request
 * hook uses, so sign-out revokes exactly what the caller sent rather than
 * whatever `locals.auth` happened to resolve to. Bearer beats cookie here for
 * the same reason it does there.
 *
 * Idempotent on purpose. A browser holding a cookie the server has already
 * forgotten — expired, revoked from another device — still has to be able to
 * get rid of it, and answering 401 would leave it stuck presenting a session
 * that does not exist. There is no oracle in that: 204 is the answer whether or
 * not a row was deleted.
 */
export function signOut(db: DatabaseSync, event: AuthEvent): Response {
	const token = sessionTokenFrom(event.request, event.cookies.get(SESSION_COOKIE));
	if (token !== undefined) endSession(db, token);
	clearSessionCookie(event.cookies, event.url);
	return signedOut();
}

/**
 * End every session the account has — the "sign out my other devices" a lost
 * phone needs, and the reason sessions are rows rather than signed tokens.
 *
 * This one does need `locals.auth`, because it acts on an account rather than
 * on a credential, and an anonymous request names no account to act on. The
 * session making the request goes with the rest: a phone that has been stolen
 * mid-session is exactly the case, and leaving the caller signed in would mean
 * doing it twice.
 */
export function signOutEverywhere(db: DatabaseSync, event: AuthEvent): Response {
	const auth = event.locals.auth;
	if (auth === null) return apiError('unauthenticated');
	endAllSessions(db, auth.account.id);
	clearSessionCookie(event.cookies, event.url);
	return signedOut();
}
