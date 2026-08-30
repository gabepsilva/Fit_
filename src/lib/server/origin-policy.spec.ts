import { describe, expect, it } from 'vitest';
import { ALLOWED_ORIGINS_VARIABLE, checkOrigin, configuredOrigins } from './origin-policy';

const SITE = 'https://fit.example';
const TOKEN = 'b'.repeat(43);

type RequestOptions = { method?: string; origin?: string; authorization?: string };

function request(options: RequestOptions = {}): Request {
	const headers = new Headers();
	if (options.origin !== undefined) headers.set('origin', options.origin);
	if (options.authorization !== undefined) headers.set('authorization', options.authorization);
	return new Request(`${SITE}/api/sessions`, { method: options.method ?? 'POST', headers });
}

const url = new URL(`${SITE}/api/sessions`);
const STAGING = 'https://staging.fit.example';

/** Set the deployment's variable for one assertion, the way `db.spec.ts` does. */
function withAllowedOrigins<T>(value: string, run: () => T): T {
	const previous = process.env[ALLOWED_ORIGINS_VARIABLE];
	process.env[ALLOWED_ORIGINS_VARIABLE] = value;
	try {
		return run();
	} finally {
		if (previous === undefined) delete process.env[ALLOWED_ORIGINS_VARIABLE];
		else process.env[ALLOWED_ORIGINS_VARIABLE] = previous;
	}
}

describe('configuredOrigins', () => {
	it('reads the origins a deployment declares', () => {
		expect(configuredOrigins({ [ALLOWED_ORIGINS_VARIABLE]: SITE })).toEqual([SITE]);
	});

	it('reads a comma-separated list, spaces and all', () => {
		expect(configuredOrigins({ [ALLOWED_ORIGINS_VARIABLE]: `${SITE}, ${STAGING}` })).toEqual([
			SITE,
			STAGING
		]);
	});

	it('keeps only the origin of a value that carries a path', () => {
		expect(configuredOrigins({ [ALLOWED_ORIGINS_VARIABLE]: `${SITE}/app` })).toEqual([SITE]);
	});

	it("falls back to adapter-node's own canonical origin", () => {
		expect(configuredOrigins({ ORIGIN: SITE })).toEqual([SITE]);
	});

	it('prefers the explicit list over the canonical origin', () => {
		expect(
			configuredOrigins({ [ALLOWED_ORIGINS_VARIABLE]: SITE, ORIGIN: 'https://elsewhere.example' })
		).toEqual([SITE]);
	});

	it('configures nothing when neither variable is set', () => {
		expect(configuredOrigins({})).toEqual([]);
	});

	it('configures nothing for an empty list rather than reaching past it', () => {
		expect(configuredOrigins({ [ALLOWED_ORIGINS_VARIABLE]: '', ORIGIN: SITE })).toEqual([]);
	});

	it('refuses a value that is not an absolute origin, rather than dropping it', () => {
		expect(() => configuredOrigins({ [ALLOWED_ORIGINS_VARIABLE]: 'fit.example' })).toThrow(
			ALLOWED_ORIGINS_VARIABLE
		);
	});

	it('names the variable the bad value came from', () => {
		expect(() => configuredOrigins({ ORIGIN: 'fit.example' })).toThrow('ORIGIN must list');
	});

	it('refuses a scheme with no origin, which would allow every sandboxed frame', () => {
		// `new URL('capacitor://localhost').origin` is the literal "null", the
		// same Origin a sandboxed iframe sends.
		expect(() =>
			configuredOrigins({ [ALLOWED_ORIGINS_VARIABLE]: 'capacitor://localhost' })
		).toThrow('has not');
	});

	it('reads the process environment when none is given', () => {
		expect(withAllowedOrigins(SITE, () => configuredOrigins())).toEqual([SITE]);
	});
});

describe('checkOrigin', () => {
	it('allows a same-origin post from the browser', () => {
		expect(checkOrigin(request({ origin: SITE }), url, [SITE])).toEqual({
			allowed: true,
			basis: 'allowed-origin'
		});
	});

	it('refuses a post from another site, which is what forgery looks like', () => {
		expect(checkOrigin(request({ origin: 'https://evil.example' }), url, [SITE])).toEqual({
			allowed: false,
			reason: 'foreign-origin'
		});
	});

	it('refuses a post with no Origin at all rather than waving it through', () => {
		expect(checkOrigin(request(), url, [SITE])).toEqual({
			allowed: false,
			reason: 'missing-origin'
		});
	});

	it('refuses the null origin a sandboxed frame sends', () => {
		expect(checkOrigin(request({ origin: 'null' }), url, [SITE])).toMatchObject({
			allowed: false
		});
	});

	it('refuses a look-alike origin that only shares a suffix', () => {
		expect(checkOrigin(request({ origin: 'https://fit.example.evil.test' }), url, [SITE])).toEqual({
			allowed: false,
			reason: 'foreign-origin'
		});
	});

	it('refuses the same host over plain HTTP, which is a different origin', () => {
		expect(checkOrigin(request({ origin: 'http://fit.example' }), url, [SITE])).toEqual({
			allowed: false,
			reason: 'foreign-origin'
		});
	});

	it.each(['GET', 'HEAD', 'OPTIONS'])('exempts the safe method %s', (method) => {
		expect(checkOrigin(request({ method, origin: 'https://evil.example' }), url, [SITE])).toEqual({
			allowed: true,
			basis: 'safe-method'
		});
	});

	it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('checks the unsafe method %s', (method) => {
		expect(
			checkOrigin(request({ method, origin: 'https://evil.example' }), url, [SITE])
		).toMatchObject({ allowed: false });
	});

	it('exempts a bearer request, whose credential no other site can make it send', () => {
		// The Android build's Origin is a WebView's, which is exactly the origin
		// the cookie policy must not trust.
		expect(
			checkOrigin(request({ authorization: `Bearer ${TOKEN}`, origin: 'http://localhost' }), url, [
				SITE
			])
		).toEqual({ allowed: true, basis: 'bearer' });
	});

	it('exempts a bearer request that sends no Origin header', () => {
		expect(checkOrigin(request({ authorization: `Bearer ${TOKEN}` }), url, [SITE])).toEqual({
			allowed: true,
			basis: 'bearer'
		});
	});

	it.each(['Basic credentials', 'Bearer', 'Bearer short', `Token ${TOKEN}`])(
		'does not let a malformed Authorization header buy the exemption: %s',
		(authorization) => {
			expect(checkOrigin(request({ authorization }), url, [SITE])).toMatchObject({
				allowed: false
			});
		}
	);

	it('allows any of the configured origins, not merely the first', () => {
		expect(checkOrigin(request({ origin: STAGING }), url, [SITE, STAGING])).toMatchObject({
			allowed: true
		});
	});

	it('falls back to the origin the request was served under when nothing is configured', () => {
		expect(checkOrigin(request({ origin: SITE }), url, [])).toEqual({
			allowed: true,
			basis: 'allowed-origin'
		});
	});

	it('still refuses a foreign origin when nothing is configured', () => {
		expect(checkOrigin(request({ origin: 'https://evil.example' }), url, [])).toEqual({
			allowed: false,
			reason: 'foreign-origin'
		});
	});

	it('does not allow the configured origin to be widened by the request itself', () => {
		// The header is compared against configuration; a request cannot vouch
		// for itself by arriving under a name the server does not answer to.
		const served = new URL('https://internal.fit.example/api/sessions');
		expect(checkOrigin(request({ origin: served.origin }), served, [SITE])).toEqual({
			allowed: false,
			reason: 'foreign-origin'
		});
	});

	it('reads the configured origins from the environment when none are passed', () => {
		const decision = withAllowedOrigins(STAGING, () => checkOrigin(request({ origin: SITE }), url));
		expect(decision).toEqual({ allowed: false, reason: 'foreign-origin' });
	});
});
