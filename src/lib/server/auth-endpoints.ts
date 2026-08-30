import { json } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import type { DatabaseSync } from 'node:sqlite';
import { apiError, readTextBody } from './api';
import { setSessionCookie } from './session-cookie';
import type { SessionCookieWriter } from './session-cookie';
import { membershipsFor, registerAccount } from './users/accounts';
import { storedTextProblem } from './users/input';
import { OWASP_SCRYPT } from './users/password';
import type { ScryptCost } from './users/password';
import { createSession, MAX_DEVICE_LABEL_LENGTH } from './users/sessions';
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
