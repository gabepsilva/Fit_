import { describe, expect, it } from 'vitest';
import { apiError, MAX_BODY_BYTES, readTextBody } from './api';

const SITE = 'https://fit.example/api/sessions';

function jsonRequest(body: string, headers: Record<string, string> = {}): Request {
	return new Request(SITE, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body
	});
}

async function errorBody(response: Response): Promise<unknown> {
	return (await response.json()) as unknown;
}

describe('apiError', () => {
	it.each([
		['invalid-body', 400],
		['invalid-input', 400],
		['invalid-credentials', 401],
		['unauthenticated', 401],
		['forbidden-origin', 403],
		['username-taken', 409],
		['too-many-attempts', 429]
	] as const)('answers %s with status %i', async (code, status) => {
		const response = apiError(code);
		expect(response.status).toBe(status);
		expect(await errorBody(response)).toEqual({ error: { code } });
	});

	it('carries back which field the caller got wrong, and why', async () => {
		const response = apiError('invalid-input', { field: 'password', reason: 'too-short' });
		expect(await errorBody(response)).toEqual({
			error: { code: 'invalid-input', field: 'password', reason: 'too-short' }
		});
	});

	it('sets the headers a code needs, such as Retry-After', () => {
		expect(
			apiError('too-many-attempts', {}, { 'retry-after': '120' }).headers.get('retry-after')
		).toBe('120');
	});

	it('answers as JSON, so a client never has to sniff the body', () => {
		expect(apiError('invalid-body').headers.get('content-type')).toContain('application/json');
	});
});

describe('readTextBody', () => {
	it('reads the text fields of a JSON object', async () => {
		expect(await readTextBody(jsonRequest('{"username":"jordan","password":"secret"}'))).toEqual({
			username: 'jordan',
			password: 'secret'
		});
	});

	it('accepts a content type that carries a charset parameter', async () => {
		const request = jsonRequest('{"username":"jordan"}', {
			'content-type': 'application/json; charset=utf-8'
		});
		expect(await readTextBody(request)).toEqual({ username: 'jordan' });
	});

	it('reads the media type past its case and the spacing around it', async () => {
		// `Content-Type` is case-insensitive and may carry space before its
		// parameters, so a client that spells it that way is still declaring JSON.
		const request = jsonRequest('{"username":"jordan"}', {
			'content-type': 'Application/JSON ; charset=UTF-8'
		});
		expect(await readTextBody(request)).toEqual({ username: 'jordan' });
	});

	it('refuses a body that does not declare JSON, whatever it contains', async () => {
		const request = new Request(SITE, {
			method: 'POST',
			headers: { 'content-type': 'text/plain' },
			body: '{"username":"jordan"}'
		});
		expect(await readTextBody(request)).toBeNull();
	});

	it('refuses a body with no content type at all', async () => {
		const request = new Request(SITE, { method: 'POST', body: 'jordan' });
		request.headers.delete('content-type');
		expect(await readTextBody(request)).toBeNull();
	});

	it('refuses a body that declares more bytes than four short strings need', async () => {
		const request = jsonRequest('{"username":"jordan"}', {
			'content-length': String(MAX_BODY_BYTES + 1)
		});
		expect(await readTextBody(request)).toBeNull();
	});

	it('accepts a body that declares exactly the ceiling', async () => {
		const padded = JSON.stringify({ username: 'j'.repeat(MAX_BODY_BYTES - 20) });
		const request = jsonRequest(padded, { 'content-length': String(MAX_BODY_BYTES) });
		expect(await readTextBody(request)).not.toBeNull();
	});

	it('refuses a malformed body rather than throwing at the caller', async () => {
		expect(await readTextBody(jsonRequest('{"username":'))).toBeNull();
	});

	it.each(['[]', '"jordan"', '42', 'null', 'true'])(
		'refuses a JSON value that is not an object: %s',
		async (body) => {
			expect(await readTextBody(jsonRequest(body))).toBeNull();
		}
	);

	it.each([
		'{"username":5}',
		'{"username":null}',
		'{"username":{"toString":"jordan"}}',
		'{"username":["jordan"]}',
		'{"username":true}'
	])('refuses a field that is not text rather than coercing it: %s', async (body) => {
		expect(await readTextBody(jsonRequest(body))).toBeNull();
	});

	it('keeps a __proto__ field as an ordinary value instead of a prototype', async () => {
		const fields = await readTextBody(jsonRequest('{"__proto__":"polluted","username":"jordan"}'));
		expect(fields?.['__proto__']).toBe('polluted');
		expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
	});

	it('reads an empty object as no fields rather than as a malformed body', async () => {
		expect(await readTextBody(jsonRequest('{}'))).toEqual({});
	});
});
