import { describe, expect, it } from 'vitest';
import { ADDRESS_SOURCE_VARIABLE, addressSource, clientAddressFor } from './client-address';

const PEER = '203.0.113.7';
const PROXY = '198.51.100.1';

function request(headers: Record<string, string> = {}): Request {
	return new Request('https://fit.example/api/sessions', { method: 'POST', headers });
}

/** Set the deployment's variable for one assertion. */
function withSource<T>(value: string, run: () => T): T {
	const previous = process.env[ADDRESS_SOURCE_VARIABLE];
	process.env[ADDRESS_SOURCE_VARIABLE] = value;
	try {
		return run();
	} finally {
		if (previous === undefined) delete process.env[ADDRESS_SOURCE_VARIABLE];
		else process.env[ADDRESS_SOURCE_VARIABLE] = previous;
	}
}

describe('addressSource', () => {
	it('assumes a direct connection when nothing is declared', () => {
		expect(addressSource({})).toBe('socket');
	});

	it('treats an empty declaration as nothing declared', () => {
		expect(addressSource({ [ADDRESS_SOURCE_VARIABLE]: '' })).toBe('socket');
	});

	it.each(['socket', 'none'])('reads the declared source %s', (declared) => {
		expect(addressSource({ [ADDRESS_SOURCE_VARIABLE]: declared })).toBe(declared);
	});

	it('accepts a forwarded address once the adapter is told where to read it', () => {
		expect(
			addressSource({ [ADDRESS_SOURCE_VARIABLE]: 'forwarded', ADDRESS_HEADER: 'X-Forwarded-For' })
		).toBe('forwarded');
	});

	it('refuses a forwarded declaration with no header to read it from', () => {
		// Without `ADDRESS_HEADER` the adapter would report the proxy itself,
		// one shared bucket for every caller.
		expect(() => addressSource({ [ADDRESS_SOURCE_VARIABLE]: 'forwarded' })).toThrow(
			'ADDRESS_HEADER'
		);
	});

	it('refuses a source that is not one of the three, rather than falling back', () => {
		expect(() => addressSource({ [ADDRESS_SOURCE_VARIABLE]: 'trusted' })).toThrow(
			ADDRESS_SOURCE_VARIABLE
		);
	});

	it('names every source it would have accepted, so the fix is in the failure', () => {
		expect(() => addressSource({ [ADDRESS_SOURCE_VARIABLE]: 'trusted' })).toThrow(
			'socket, forwarded, none'
		);
	});

	it('reads the process environment when none is given', () => {
		expect(withSource('none', () => addressSource())).toBe('none');
	});
});

describe('clientAddressFor', () => {
	it('counts against the connecting peer on a directly exposed server', () => {
		expect(clientAddressFor(request(), () => PEER, 'socket')).toBe(PEER);
	});

	it('counts against the address the adapter resolved behind a declared proxy', () => {
		expect(clientAddressFor(request({ 'x-forwarded-for': PEER }), () => PEER, 'forwarded')).toBe(
			PEER
		);
	});

	it('skips the address scope entirely when the deployment declares none', () => {
		expect(clientAddressFor(request(), () => PEER, 'none')).toBeNull();
	});

	it('does not call for an address it has already decided not to use', () => {
		expect(
			clientAddressFor(
				request(),
				() => {
					throw new Error('the adapter cannot determine an address');
				},
				'none'
			)
		).toBeNull();
	});

	it.each(['x-forwarded-for', 'forwarded'])(
		'drops the socket address when %s says an undeclared proxy rewrote the connection',
		(header) => {
			// The peer would be the proxy, so every caller would share one bucket.
			expect(clientAddressFor(request({ [header]: PEER }), () => PROXY, 'socket')).toBeNull();
		}
	);

	it('reads a forwarding header whatever case it arrives in', () => {
		expect(
			clientAddressFor(request({ 'X-Forwarded-For': PEER }), () => PROXY, 'socket')
		).toBeNull();
	});

	it('keeps the socket address when no forwarding header is present', () => {
		expect(clientAddressFor(request({ 'user-agent': 'Fit_/1.0' }), () => PEER, 'socket')).toBe(
			PEER
		);
	});

	it('reads the declared source from the environment when none is passed', () => {
		expect(withSource('none', () => clientAddressFor(request(), () => PEER))).toBeNull();
	});
});
