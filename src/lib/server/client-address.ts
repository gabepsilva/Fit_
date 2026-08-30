/**
 * Which address the sign-in throttle is allowed to count against.
 *
 * The throttle's `address` scope stops one client spraying a common password
 * across many usernames, and it can only do that if the address it keys on is
 * the client's. Behind a reverse proxy, `getClientAddress()` returns the
 * innermost proxy instead, and every caller in the world lands in one bucket:
 * the scope stops catching spraying and starts locking a whole deployment out
 * fifty failures at a time. That is not a subtlety to leave implicit, so this
 * module makes the deployment say which situation it is in.
 *
 * `adapter-node` already owns the hard part. Given `ADDRESS_HEADER` — and
 * `XFF_DEPTH` when that header is `X-Forwarded-For` — it reads the address from
 * the right, counting past the proxies it was told to trust, rather than
 * believing the leftmost value an attacker can prepend. So nothing here parses
 * a forwarding header itself. The only address these endpoints ever use is the
 * one the adapter vouches for; this module decides whether to believe it.
 */

/** How this deployment learns a caller's address. */
export const ADDRESS_SOURCE_VARIABLE = 'FIT_CLIENT_ADDRESS';

/** `adapter-node`'s own variable, which is what makes a forwarded address verified. */
const NODE_ADDRESS_HEADER_VARIABLE = 'ADDRESS_HEADER';

/**
 * - `socket`: the server is reached directly, so the connecting peer is the
 *   client. The default, because it is true of `vite dev` and of every
 *   environment this repository currently has.
 * - `forwarded`: a proxy sits in front, and `ADDRESS_HEADER` names the header
 *   carrying the client's address. Declaring it without that variable throws,
 *   so "we are behind a proxy" cannot be said without saying how to read past it.
 * - `none`: the deployment cannot determine an address. The `address` scope is
 *   skipped and only the `username` scope runs.
 */
const SOURCES = ['socket', 'forwarded', 'none'] as const;

export type AddressSource = (typeof SOURCES)[number];

/**
 * Headers that mean something between us and the peer rewrote the connection.
 * `Forwarded` is RFC 7239; `X-Forwarded-For` is what proxies actually send.
 */
const FORWARDING_HEADERS = ['forwarded', 'x-forwarded-for'];

function isAddressSource(value: string): value is AddressSource {
	return (SOURCES as readonly string[]).includes(value);
}

/**
 * The declared source, or `socket`.
 *
 * A value that is not one of the three throws rather than falling back, for the
 * same reason `configuredOrigins` throws on a malformed origin: a security
 * setting that silently means something other than what it says is worse than
 * one that stops the server.
 */
export function addressSource(
	environment: Record<string, string | undefined> = process.env
): AddressSource {
	const declared = environment[ADDRESS_SOURCE_VARIABLE];
	if (declared === undefined || declared === '') return 'socket';
	if (!isAddressSource(declared)) {
		throw new Error(
			`${ADDRESS_SOURCE_VARIABLE} must be one of ${SOURCES.join(', ')}; "${declared}" is not`
		);
	}
	if (declared === 'forwarded' && !environment[NODE_ADDRESS_HEADER_VARIABLE]) {
		throw new Error(
			`${ADDRESS_SOURCE_VARIABLE}=forwarded needs ${NODE_ADDRESS_HEADER_VARIABLE} to name the header the client's address arrives in`
		);
	}
	return declared;
}

/**
 * The address to throttle against, or `null` to skip the address scope.
 *
 * The one piece of judgement here: a request that arrives with a forwarding
 * header at a server configured for a direct connection is a proxy nobody
 * declared. Its socket peer is the proxy, so counting against it would put
 * every caller in one bucket — the exact failure this module exists to avoid —
 * and the address is dropped instead.
 *
 * The cost of that is honest and worth stating: a client reaching a directly
 * exposed server can excuse itself from the address scope by sending an
 * `X-Forwarded-For` of its own. It buys nothing against a single account,
 * because the `username` scope is keyed on the submitted name and counts every
 * attempt regardless. The trade is a spraying attacker who can opt out of a
 * best-effort counter, against a misconfigured deployment locking out all of
 * its own users; the second is both likelier and worse.
 */
export function clientAddressFor(
	request: Request,
	getClientAddress: () => string,
	source: AddressSource = addressSource()
): string | null {
	if (source === 'none') return null;
	if (source === 'socket' && FORWARDING_HEADERS.some((name) => request.headers.has(name))) {
		return null;
	}
	return getClientAddress();
}
