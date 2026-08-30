import { json } from '@sveltejs/kit';

/**
 * The one shape every endpoint fails in.
 *
 * A code rather than a sentence, for the same reason `usernameProblem` returns
 * one: the interface owns the wording, and a message written here would be
 * translated nowhere and matched on by a client that should be matching on the
 * code. `field` and `reason` carry back what the caller got wrong about its own
 * input, and nothing about what the server holds.
 *
 * The status is derived from the code rather than passed beside it, so two
 * endpoints cannot answer the same failure with different numbers.
 */
const STATUS = {
	/** The body was not a JSON object of text fields, or was too large to be one. */
	'invalid-body': 400,
	/** A field was present and unusable; `field` and `reason` say which and why. */
	'invalid-input': 400,
	/** Sign-in failed. Deliberately the same answer for an unknown name and a wrong password. */
	'invalid-credentials': 401,
	/** The request carried no session, and this endpoint needs one. */
	unauthenticated: 401,
	/** The origin policy refused a state-changing request. */
	'forbidden-origin': 403,
	/** Registration only: the username is already in use. */
	'username-taken': 409,
	/** The sign-in throttle is holding this attempt; `Retry-After` says for how long. */
	'too-many-attempts': 429
} as const;

export type ApiErrorCode = keyof typeof STATUS;

/** What the caller got wrong about its own input. Never anything about stored state. */
export type ApiErrorDetail = { field?: string; reason?: string };

/** The failure body: `{ "error": { "code": ..., "field": ..., "reason": ... } }`. */
export function apiError(
	code: ApiErrorCode,
	detail: ApiErrorDetail = {},
	headers: Record<string, string> = {}
): Response {
	return json({ error: { code, ...detail } }, { status: STATUS[code], headers });
}

/**
 * A body larger than this is not a sign-in, so it is refused before it is
 * parsed. `adapter-node`'s own `BODY_SIZE_LIMIT` is half a megabyte, which is a
 * sensible ceiling for uploads and a preposterous one for four short strings.
 */
export const MAX_BODY_BYTES = 4096;

const JSON_CONTENT_TYPE = 'application/json';

/**
 * Every value these endpoints read is text, so a body carrying anything else is
 * malformed rather than something to coerce. Refusing to guess is what stops
 * `{"username": {"toString": ...}}` from reaching a query as some other shape.
 */
function textFieldsOf(parsed: unknown): Record<string, string> | null {
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
	const record = parsed as Record<string, unknown>;
	// Null-prototype, so a `__proto__` key in the body is an ordinary field
	// rather than an assignment the runtime treats specially.
	const fields = Object.create(null) as Record<string, string>;
	for (const name of Object.keys(record)) {
		const value = record[name];
		if (typeof value !== 'string') return null;
		fields[name] = value;
	}
	return fields;
}

/**
 * The request body as text fields, or `null` for anything that is not one.
 *
 * The content type is required rather than sniffed: a request that does not
 * declare JSON is not JSON, and declaring it is also what keeps these endpoints
 * outside the set of content types a cross-site form can produce.
 */
export async function readTextBody(request: Request): Promise<Record<string, string> | null> {
	const declaredType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
	if (declaredType !== JSON_CONTENT_TYPE) return null;
	if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return null;
	let parsed: unknown;
	try {
		parsed = await request.json();
	} catch {
		// A truncated or malformed body is the caller's problem, not an incident.
		return null;
	}
	return textFieldsOf(parsed);
}
