import { json } from '@sveltejs/kit';

/**
 * `field` and `reason` name what the caller got wrong about its own input, and
 * nothing about what the server holds. The code, not a sentence, is what
 * clients match on. The status is derived from the code, so two endpoints
 * cannot answer the same failure with different numbers.
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
	/** The catalog has no row for what was asked, such as a barcode nothing carries. */
	'not-found': 404,
	/** Registration only: the username is already in use. */
	'username-taken': 409,
	/** A write's expected version does not match what is stored; the current document is returned alongside it. */
	'stale-version': 409,
	/** The sign-in throttle is holding this attempt; `Retry-After` says for how long. */
	'too-many-attempts': 429,
	/**
	 * The food catalog is not installed on this server. It is a 365 MB file
	 * shipped outside the release, so a deployment without it still serves
	 * every other route and the client falls back to its bundled foods.
	 */
	'catalog-unavailable': 503,
	/**
	 * Reading a photo is not possible right now: no vision key is configured,
	 * or the model refused, timed out or failed. One code for all of them
	 * deliberately — the caller can do nothing differently about any of them,
	 * and the upstream's own status is a fact about our account, not theirs.
	 */
	'photo-unavailable': 503
} as const;

export type ApiErrorCode = keyof typeof STATUS;

/** What the caller got wrong about its own input. Never anything about stored state. */
export type ApiErrorDetail = { field?: string; reason?: string };

export function apiError(
	code: ApiErrorCode,
	detail: ApiErrorDetail = {},
	headers: Record<string, string> = {}
): Response {
	return json({ error: { code, ...detail } }, { status: STATUS[code], headers });
}

/**
 * Refused before parsing: four short strings need far less than
 * `adapter-node`'s `BODY_SIZE_LIMIT`, which is sized for uploads.
 */
export const MAX_BODY_BYTES = 4096;

const JSON_CONTENT_TYPE = 'application/json';

/**
 * Every value is text; anything else is malformed, not something to coerce. No
 * coercion is what stops `{"username": {"toString": ...}}` from reaching a query
 * as some other shape.
 */
function textFieldsOf(parsed: unknown): Record<string, string> | null {
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
	const record = parsed as Record<string, unknown>;
	// Null-prototype, so a `__proto__` key is an ordinary field, not a prototype
	// assignment.
	const fields = Object.create(null) as Record<string, string>;
	for (const name of Object.keys(record)) {
		const value = record[name];
		if (typeof value !== 'string') return null;
		fields[name] = value;
	}
	return fields;
}

/**
 * The body as text fields, or `null` for anything that is not one. The content
 * type is required, not sniffed: a body that does not declare JSON is not JSON.
 * Requiring it also keeps these endpoints outside the content types a
 * cross-site form can produce.
 */
export async function readTextBody(request: Request): Promise<Record<string, string> | null> {
	const declaredType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
	if (declaredType !== JSON_CONTENT_TYPE) return null;
	if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return null;
	let parsed: unknown;
	try {
		parsed = await request.json();
	} catch {
		// A malformed body is the sender's error, not an error to throw here.
		return null;
	}
	return textFieldsOf(parsed);
}
