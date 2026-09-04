import { json } from '@sveltejs/kit';
import type { DatabaseSync } from 'node:sqlite';
import { apiError } from '../api';
import type { Auth, Membership } from '../users/types';
import { readDocument, writeDocument } from './document';

/**
 * The one document every household has: the whole client-side store, synced
 * through this pair of endpoints rather than through individual fields.
 */
const STATE_FORMAT = 'tend.v1';

/**
 * The document is the household's entire store, not a handful of text fields;
 * `readTextBody` in `api.ts` caps at 4 KB for that reason and does not fit here.
 */
const MAX_STATE_BODY_BYTES = 4 * 1024 * 1024;

const JSON_CONTENT_TYPE = 'application/json';

/**
 * The part of SvelteKit's `RequestEvent` these handlers use — see `AuthEvent`
 * in `auth-endpoints.ts` for why it is kept narrow.
 */
export type StateEvent = {
	request: Request;
	locals: App.Locals;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type ParsedStateBody =
	| { ok: true; version: number; format: string; body: Record<string, unknown> }
	| { ok: false; code: 'invalid-body' }
	| { ok: false; code: 'invalid-input'; field: string; reason: string };

function hasJsonContentType(request: Request): boolean {
	const declaredType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
	return declaredType === JSON_CONTENT_TYPE;
}

/** The text of the body, or `null` for a stream that failed or ran past the ceiling. */
async function readBodyText(request: Request): Promise<string | null> {
	try {
		const raw = await request.text();
		return raw.length > MAX_STATE_BODY_BYTES ? null : raw;
	} catch {
		return null;
	}
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		return isPlainObject(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function isInvalidVersion(value: unknown): boolean {
	return typeof value !== 'number' || !Number.isInteger(value) || value < 0;
}

/**
 * The PUT payload: a JSON object carrying the household's whole document, up
 * to 4 MB. Checked twice against that ceiling — the declared `content-length`
 * before anything is read, and the text actually received — because the header
 * is only what the sender claims.
 */
export async function readStateBody(request: Request): Promise<ParsedStateBody> {
	const declaredLength = Number(request.headers.get('content-length'));
	if (!hasJsonContentType(request) || declaredLength > MAX_STATE_BODY_BYTES) {
		return { ok: false, code: 'invalid-body' };
	}
	const raw = await readBodyText(request);
	if (raw === null) return { ok: false, code: 'invalid-body' };
	const parsed = parseJsonObject(raw);
	if (parsed === null || !isPlainObject(parsed['body'])) {
		return { ok: false, code: 'invalid-body' };
	}
	const version = parsed['version'];
	if (isInvalidVersion(version)) {
		return { ok: false, code: 'invalid-input', field: 'version', reason: 'invalid' };
	}
	const format = parsed['format'];
	if (format !== STATE_FORMAT) {
		return { ok: false, code: 'invalid-input', field: 'format', reason: 'unsupported' };
	}
	return { ok: true, version: version as number, format, body: parsed['body'] };
}

/** The signed-in account and its first household, or `null` for no session. */
function requireHousehold(event: StateEvent): { auth: Auth; household: Membership } | null {
	const auth = event.locals.auth;
	const household = auth?.households[0];
	if (!auth || !household) return null;
	return { auth, household };
}

/**
 * The household's document, or the empty shape nothing-stored reads as. `body`
 * is parsed here, once, so every caller gets the object it originally sent
 * rather than the JSON text it was stored as.
 */
export function readState(db: DatabaseSync, event: StateEvent): Response {
	const context = requireHousehold(event);
	if (context === null) return apiError('unauthenticated');
	const document = readDocument(db, context.household.householdId);
	if (document === null) {
		return json({ version: 0, format: STATE_FORMAT, body: null, updatedAt: null });
	}
	return json({
		version: document.version,
		format: document.format,
		body: JSON.parse(document.body) as unknown,
		updatedAt: document.updatedAt
	});
}

/**
 * Store the household's document, or refuse it. A version mismatch is not the
 * caller's fault the way a malformed body is: it means another writer went
 * first, so the answer carries what is actually stored rather than just a code.
 *
 * The body is re-serialized before it is stored, so what is on disk is exactly
 * `JSON.stringify` of what was sent, never the sender's original formatting.
 */
export async function writeState(db: DatabaseSync, event: StateEvent): Promise<Response> {
	const context = requireHousehold(event);
	if (context === null) return apiError('unauthenticated');
	const parsed = await readStateBody(event.request);
	if (!parsed.ok) {
		return parsed.code === 'invalid-body'
			? apiError('invalid-body')
			: apiError('invalid-input', { field: parsed.field, reason: parsed.reason });
	}
	const result = writeDocument(db, context.household.householdId, {
		accountId: context.auth.account.id,
		expectedVersion: parsed.version,
		format: parsed.format,
		body: JSON.stringify(parsed.body)
	});
	if (result.ok) return json({ version: result.version, updatedAt: result.updatedAt });
	const current = result.current;
	return json(
		{
			error: { code: 'stale-version' },
			version: current?.version ?? 0,
			format: current?.format ?? STATE_FORMAT,
			body: current ? (JSON.parse(current.body) as unknown) : null
		},
		{ status: 409 }
	);
}
