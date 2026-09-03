import { hasBearerCredential } from './request-auth';

/**
 * Which state-changing requests are allowed at all.
 *
 * Cookies are ambient, so the cookie client proves its origin; a bearer token
 * is attached deliberately and is exempt. The Capacitor origin is never in the
 * list: a WebView presents `localhost`, which must not be trusted. Origins are
 * configuration, so an undeclared deployment fails closed until it declares
 * them. SvelteKit's own check covers form-encoded posts only; this one covers
 * every unsafe method.
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
	// Schemes with no origin normalize to the string "null", which sandboxed
	// frames send; allowing it would allow every sandboxed frame.
	if (parsed.origin === 'null') {
		throw new Error(`${variable} must list origins with a scheme that has one; "${value}" has not`);
	}
	// Only the origin is compared against the header, so paths are dropped.
	return parsed.origin;
}

/**
 * The configured origins, most specific variable first.
 *
 * Empty means same-origin only; a malformed value throws rather than silently
 * narrowing the policy.
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
 * Browsers always send `Origin` on unsafe methods, so a missing one is refused
 * rather than waved through.
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
	// Nothing configured: the allowed origin is the one the server answers under.
	const allowed = origins.length > 0 ? origins : [url.origin];
	if (!allowed.includes(origin)) return { allowed: false, reason: 'foreign-origin' };
	return { allowed: true, basis: 'allowed-origin' };
}
