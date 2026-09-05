import { json } from '@sveltejs/kit';
import type { DatabaseSync } from 'node:sqlite';
import { apiError, MAX_BODY_BYTES } from '../api';
import { ready } from './endpoints';
import { resolveFood } from './resolve';

/**
 * `POST /api/foods/resolve`: the catalog rows for the food names one typed
 * sentence held.
 *
 * The client still splits "two eggs, 150g rice" into chunks and reads the
 * quantities off them -- that is arithmetic on the words and needs no catalog.
 * Naming the food is the part that needs 2.5 million rows, so it happens here,
 * for the whole sentence in one round trip rather than one request per chunk.
 */

/** The part of SvelteKit's `RequestEvent` this handler uses, kept narrow as its siblings are. */
export type ResolveEvent = {
	request: Request;
	locals: App.Locals;
};

/**
 * How many names one sentence may ask about.
 *
 * Each one is a full-text search of the catalog, so the cap is what stops a
 * single request buying an unbounded number of them. Twelve is far more foods
 * than a sentence a person types by hand holds; the client keeps whatever is
 * past it as an unmatched proposal rather than dropping it silently.
 */
export const MAX_QUERIES = 12;

/**
 * The longest a single name may be. A food name past eighty characters is not
 * a name, and the ranking has nothing to do with the tail of it.
 */
export const MAX_QUERY_LENGTH = 80;

/** One code for every way the body is wrong: none of them says anything about stored state. */
type ParsedResolveBody = { ok: true; queries: string[] } | { ok: false };

const REFUSED = { ok: false } as const;

/**
 * Whether the field is a list of names this endpoint will search for: present,
 * non-empty, within the cap, and every entry a string no longer than one name.
 */
function namesQueries(value: unknown): value is string[] {
	if (!Array.isArray(value)) return false;
	if (value.length === 0 || value.length > MAX_QUERIES) return false;
	return value.every((query) => typeof query === 'string' && query.length <= MAX_QUERY_LENGTH);
}

/**
 * Whether the request declares JSON. The media type is the text before any
 * parameter, compared case-insensitively; a request that declares no content
 * type at all is not JSON, which also keeps this endpoint outside the content
 * types a cross-site form can produce.
 */
function declaresJson(request: Request): boolean {
	const header = request.headers.get('content-type');
	if (header === null) return false;
	const separator = header.indexOf(';');
	const type = separator === -1 ? header : header.slice(0, separator);
	return type.trim().toLowerCase() === 'application/json';
}

/**
 * The names asked about, or the refusal.
 *
 * An empty list is refused rather than answered with an empty result: nothing
 * the client does produces one, so a body that carries none is a caller that
 * built it by hand, and answering it would spend a round trip saying nothing.
 * `MAX_BODY_BYTES` is `api.ts`'s ceiling for a handful of short strings, and
 * twelve names of eighty characters sits well inside it.
 */
async function readResolveBody(request: Request): Promise<ParsedResolveBody> {
	if (!declaresJson(request)) return REFUSED;
	if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return REFUSED;

	let raw: string;
	try {
		raw = await request.text();
	} catch {
		// A stream that broke is the sender's problem, not an error to throw here.
		return REFUSED;
	}
	if (raw.length > MAX_BODY_BYTES) return REFUSED;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return REFUSED;
	}
	// A string, a number and JSON's own `null` all answer `undefined` for the
	// field, which `namesQueries` already turns away, so there is no separate
	// "is this an object" test for a body no caller could get past it.
	const fields = (parsed ?? {}) as Record<string, unknown>;
	const queries = fields['queries'];
	if (!namesQueries(queries)) return REFUSED;
	return { ok: true, queries };
}

/**
 * Resolve every name one sentence held.
 *
 * The refusals run in the order the catalog's other handlers use: no session
 * first, then no catalog, then a body this endpoint cannot read. `items` is
 * one row per query, in the order they were asked, so the caller can line the
 * answers up with its own chunks without matching on the text.
 */
export async function resolveFoodNames(
	catalog: DatabaseSync | null,
	event: ResolveEvent
): Promise<Response> {
	const gate = ready(catalog, event.locals);
	if (!gate.ok) return gate.response;
	const body = await readResolveBody(event.request);
	if (!body.ok) return apiError('invalid-body');
	return json({
		items: body.queries.map((query) => ({ query, ...resolveFood(gate.catalog, query) }))
	});
}
