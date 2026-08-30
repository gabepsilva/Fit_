import { hasBearerCredential } from './request-auth';

/**
 * Which state-changing requests are allowed to be made at all.
 *
 * A cookie is ambient: the browser attaches it to a request another site
 * caused, which is the whole of cross-site request forgery. A bearer token is
 * not — the Android build has to read it out of storage and put it on the
 * request itself, and a page on another origin cannot make it do that. So the
 * two clients are checked differently on purpose: the cookie client must prove
 * where the request came from, and the bearer client is exempt.
 *
 * That exemption is also why the Capacitor origin is not in the allowed list.
 * A WebView presents `http://localhost` or `capacitor://localhost`, and
 * trusting either would trust every page any browser serves from localhost.
 *
 * SvelteKit has its own origin check, but it only covers form-encoded posts.
 * This one covers every unsafe method whatever the body, and is deliberately
 * not implicit: the origins that may drive this server are configuration, so
 * a deployment behind a different name fails closed until it says so.
 */

/** The environment variable that names the origins allowed to drive this server. */
export const ALLOWED_ORIGINS_VARIABLE = 'FIT_ALLOWED_ORIGINS';

/** `adapter-node`'s own canonical origin, used when the list above is not set. */
const NODE_ORIGIN_VARIABLE = 'ORIGIN';

/** Methods defined as safe by RFC 9110: they may not change state, so they are exempt. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type OriginDecision =
	| { allowed: true; basis: 'safe-method' | 'bearer' | 'allowed-origin' }
	| { allowed: false; reason: 'missing-origin' | 'foreign-origin' };

function toOrigin(value: string, variable: string): string {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(`${variable} must list absolute origins; "${value}" is not one`);
	}
	// A scheme the URL standard has no origin for — `capacitor://localhost`, say
	// — normalizes to the literal "null", which is also what a sandboxed frame
	// sends. Allowing it would allow every one of them.
	if (parsed.origin === 'null') {
		throw new Error(`${variable} must list origins with a scheme that has one; "${value}" has not`);
	}
	// `https://fit.example/app` and `https://fit.example` are the same origin,
	// and only the origin is ever compared against the header.
	return parsed.origin;
}

/**
 * The configured origins, most specific variable first.
 *
 * Empty means nothing was configured, which the check reads as same-origin
 * only. A misconfigured value throws rather than narrowing to nothing, because
 * a policy that silently allows less is a policy nobody notices is wrong.
 */
export function configuredOrigins(
	environment: Record<string, string | undefined> = process.env
): string[] {
	const variable =
		environment[ALLOWED_ORIGINS_VARIABLE] === undefined
			? NODE_ORIGIN_VARIABLE
			: ALLOWED_ORIGINS_VARIABLE;
	return (environment[variable] ?? '')
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value !== '')
		.map((value) => toOrigin(value, variable));
}

/**
 * Whether this request may change state.
 *
 * A missing `Origin` header is refused rather than waved through: every browser
 * has sent one on unsafe methods for years, so its absence is either a client
 * that is not a browser — which can send the bearer token instead — or an
 * attempt to dodge the check.
 */
export function checkOrigin(
	request: Request,
	url: URL,
	origins: readonly string[] = configuredOrigins()
): OriginDecision {
	if (SAFE_METHODS.has(request.method.toUpperCase())) {
		return { allowed: true, basis: 'safe-method' };
	}
	if (hasBearerCredential(request)) return { allowed: true, basis: 'bearer' };
	const origin = request.headers.get('origin');
	if (origin === null) return { allowed: false, reason: 'missing-origin' };
	// Nothing configured means the server answers under one name and that name
	// is the one it is being asked under.
	const allowed = origins.length > 0 ? origins : [url.origin];
	if (!allowed.includes(origin)) return { allowed: false, reason: 'foreign-origin' };
	return { allowed: true, basis: 'allowed-origin' };
}
