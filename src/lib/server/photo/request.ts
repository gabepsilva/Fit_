import { MEALS, type Meal } from '$lib/domain/types';

/**
 * The body `POST /api/meals/photo` accepts, and the one reason it is refused.
 *
 * A photo is not four short text fields, so `readTextBody` in `api.ts` and its
 * 4 KB ceiling do not fit; nor is it the household's whole document, so
 * `readStateBody` does not either. This one carries a still and a meal, and
 * everything it can be wrong about is the caller's own input.
 */

/**
 * A 720 px JPEG at quality 0.82 — what `src/lib/ui/camera.ts` produces — is
 * tens of kilobytes of base64. 600 KB is an order of magnitude of headroom for
 * a device whose camera is larger than the one measured, and still small
 * enough that a hostile caller cannot make the server hold a megabyte per
 * request.
 */
export const MAX_PHOTO_BODY_BYTES = 600 * 1024;

/**
 * Only JPEG, and only base64. The capture path emits exactly this prefix, so
 * anything else is a caller that built the body by hand — and a data URL of
 * another type is a request to forward an arbitrary file to a paid API.
 */
const JPEG_DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

export type ParsedPhotoBody =
	| { ok: true; image: string; meal: Meal }
	/** One code for every way the body is wrong: none of them says anything about stored state. */
	| { ok: false; code: 'invalid-body' };

const REFUSED = { ok: false, code: 'invalid-body' } as const;

/** The media type before any parameter, lower-cased. `null` when none was declared. */
function declaredType(request: Request): string | null {
	const header = request.headers.get('content-type');
	if (header === null) return null;
	const separator = header.indexOf(';');
	const type = separator === -1 ? header : header.slice(0, separator);
	return type.trim().toLowerCase();
}

/**
 * `includes` on a tuple of strings is already false for every value that is not
 * one of them, so there is no `typeof` guard here: it would be a branch no input
 * could take differently.
 */
function isMeal(value: unknown): value is Meal {
	return MEALS.includes(value as Meal);
}

/**
 * The body as something the caller can read fields off, or `null` for text that
 * is not JSON at all.
 *
 * There is deliberately no "is this an object" test: a string, a number and an
 * array all answer `undefined` to every field the caller reads, which is
 * already a rejection, and JSON's own `null` is returned as it is so the caller
 * turns it away beside them. A guard here would be a branch no body could take
 * differently.
 */
function fieldsOf(raw: string): Record<string, unknown> | null {
	try {
		return JSON.parse(raw) as Record<string, unknown> | null;
	} catch {
		return null;
	}
}

/**
 * The request as a still and a meal, or the refusal.
 *
 * The ceiling is checked twice: once against the declared `content-length`, so
 * an oversized body is refused before it is read, and once against the text
 * actually received, because the header is only what the sender claims.
 */
export async function readPhotoBody(request: Request): Promise<ParsedPhotoBody> {
	if (declaredType(request) !== 'application/json') return REFUSED;
	if (Number(request.headers.get('content-length')) > MAX_PHOTO_BODY_BYTES) return REFUSED;

	let raw: string;
	try {
		raw = await request.text();
	} catch {
		// A stream that broke is the sender's problem, not an error to throw here.
		return REFUSED;
	}
	if (raw.length > MAX_PHOTO_BODY_BYTES) return REFUSED;

	const fields = fieldsOf(raw);
	if (fields === null) return REFUSED;
	const image = fields['image'];
	const meal = fields['meal'];
	// The type check is not narrowing for the compiler's sake: `test` coerces its
	// argument, so a one-element array of a valid data URL would match, and the
	// array — not a string — would then be forwarded to a paid API.
	if (typeof image !== 'string' || !JPEG_DATA_URL.test(image)) return REFUSED;
	if (!isMeal(meal)) return REFUSED;
	return { ok: true, image, meal };
}
