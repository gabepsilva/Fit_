/**
 * Where the sign-in throttle's `address` scope reads the caller's address from.
 *
 * Behind a proxy, `getClientAddress()` reports the proxy itself, so every
 * caller would share one bucket. The deployment declares which setup it is;
 * only `adapter-node` parses forwarding headers, and this module decides
 * whether to trust the address it resolves.
 */

/** How this deployment learns a caller's address. */
export const ADDRESS_SOURCE_VARIABLE = 'FIT_CLIENT_ADDRESS';

/** `adapter-node`'s variable; `forwarded` mode is only trusted with it set. */
const NODE_ADDRESS_HEADER_VARIABLE = 'ADDRESS_HEADER';

/**
 * `socket`: the connecting peer is the client. Default, true of `vite dev`.
 * `forwarded`: a proxy sits in front; `ADDRESS_HEADER` must be set or this throws.
 * `none`: no address available; the `address` scope is skipped.
 */
const SOURCES = ['socket', 'forwarded', 'none'] as const;

export type AddressSource = (typeof SOURCES)[number];

/** Headers whose presence means a proxy rewrote the connection. */
const FORWARDING_HEADERS = ['forwarded', 'x-forwarded-for'];

function isAddressSource(value: string): value is AddressSource {
	return (SOURCES as readonly string[]).includes(value);
}

/**
 * The declared source, or `socket` when nothing is declared.
 * An unknown value throws rather than falling back: a security setting that
 * silently means something else is worse than one that stops the server.
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
 * A forwarding header at a socket-configured server names an undeclared proxy,
 * whose peer would bucket every caller, so the address is dropped. A client
 * can opt out of the address scope this way, but the `username` scope still
 * counts every attempt regardless.
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
