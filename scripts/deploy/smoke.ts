import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
	APP_PORT,
	CURRENT_LINK,
	deployHost,
	PUBLIC_ORIGIN,
	SSH_OPTIONS,
	remote,
	shellQuote
} from './config';
import { capture, projectRoot } from '../security/shared';

/**
 * What "it deployed" means, asserted against the running server rather than
 * against the deploy's own exit code.
 *
 * The registration and sign-in round trip is the point: it is the only path
 * that touches SQLite, the migration list, scrypt and the session cookie at
 * once, so it fails when any of those is misconfigured on the machine. The
 * throwaway account it leaves behind is named for the clock and some
 * randomness so it is identifiable; nothing deletes accounts yet, and inventing
 * a destructive query for the production database is not this script's job.
 */

/** Registration counts every attempt from one address, ten to the hour. */
const DOCUMENTATION_PREFIX = '2001:db8::';

/** Long enough for the password floor of 10, and never reused. */
const PASSWORD_BYTES = 16;

/**
 * What only this app puts in a page.
 *
 * A 200 is not evidence: anything at all can be listening on the origin's port,
 * and a static file server answering from an empty directory returns one too.
 * `ssr = false` means the page carries no rendered heading to look for, so the
 * marker is the immutable asset path SvelteKit builds every page's client
 * bootstrap around.
 */
const CLIENT_BUNDLE_PREFIX = '/_app/immutable/';

const REQUEST_TIMEOUT_MS = 30_000;
const TUNNEL_READY_TIMEOUT_MS = 15_000;
const TUNNEL_POLL_MS = 200;

type Check = { name: string; detail: string };

const passed: Check[] = [];

class SmokeFailure extends Error {}

function check(name: string, ok: boolean, detail: string): void {
	if (!ok) throw new SmokeFailure(`${name}: ${detail}`);
	passed.push({ name, detail });
}

type Options = {
	/** Where requests are sent. Not always the origin: see `--tunnel`. */
	base: string;
	/** The origin the app is configured to accept writes from. */
	origin: string;
	/** The release expected to be live. */
	commit: string;
	tunnel: boolean;
};

function parseOptions(argv: string[]): Options {
	const flags = new Map<string, string>();
	let tunnel = false;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index] ?? '';
		if (argument === '--tunnel') {
			tunnel = true;
			continue;
		}
		if (!argument.startsWith('--')) throw new Error(`unexpected argument ${argument}`);
		const value = argv[index + 1];
		if (value === undefined) throw new Error(`${argument} needs a value`);
		flags.set(argument.slice(2), value);
		index += 1;
	}
	return {
		base: (flags.get('base') ?? PUBLIC_ORIGIN).replace(/\/$/, ''),
		origin: flags.get('origin') ?? PUBLIC_ORIGIN,
		commit: flags.get('commit') ?? '',
		tunnel
	};
}

/** A port the kernel just handed out, released before ssh claims it. */
async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.on('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const address = probe.address();
			if (address === null || typeof address === 'string') {
				reject(new Error('could not reserve a local port'));
				return;
			}
			probe.close(() => resolve(address.port));
		});
	});
}

async function accepts(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = connect({ port, host: '127.0.0.1' });
		socket.on('connect', () => {
			socket.destroy();
			resolve(true);
		});
		socket.on('error', () => resolve(false));
	});
}

/**
 * A local port forwarded to the app's own port on the machine.
 *
 * The public name has to resolve and reach this host before the smoke check
 * can run against the real origin. Until it does, this is how the deployed
 * server is exercised end to end rather than assumed to work.
 */
async function openTunnel(port: number): Promise<ChildProcess> {
	const child = spawn(
		'ssh',
		[...SSH_OPTIONS, '-N', '-L', `127.0.0.1:${port}:127.0.0.1:${APP_PORT}`, deployHost()],
		{ stdio: ['ignore', 'ignore', 'inherit'] }
	);
	const deadline = Date.now() + TUNNEL_READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) throw new Error('ssh tunnel exited before it was ready');
		if (await accepts(port)) return child;
		await delay(TUNNEL_POLL_MS);
	}
	child.kill('SIGTERM');
	throw new Error(`ssh tunnel did not accept connections on 127.0.0.1:${port}`);
}

type Client = {
	get: (pathname: string) => Promise<Response>;
	send: (method: string, pathname: string, body?: unknown) => Promise<Response>;
	adopt: (response: Response) => void;
	cookie: () => string | undefined;
};

/**
 * The client Cloudflare would look like: the configured `Origin` on every
 * unsafe method, and the client-address header `ADDRESS_HEADER` names.
 *
 * `getClientAddress()` throws when that header is missing, so a request without
 * it is a 500 and proves nothing. The address is a fresh one from the
 * documentation range each run, because registration is throttled per address
 * and a fixed one would lock the eleventh deploy of the hour out of its own
 * smoke check.
 */
function createClient(options: Options): Client {
	const clientAddress = DOCUMENTATION_PREFIX + randomBytes(4).toString('hex');
	let cookie: string | undefined;
	const headers = (extra: Record<string, string>): Record<string, string> => ({
		'cf-connecting-ip': clientAddress,
		...(cookie === undefined ? {} : { cookie }),
		...extra
	});
	const fetchWith = async (pathname: string, init: RequestInit): Promise<Response> =>
		fetch(`${options.base}${pathname}`, {
			...init,
			redirect: 'manual',
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
	return {
		get: (pathname) => fetchWith(pathname, { headers: headers({}) }),
		send: (method, pathname, body) =>
			fetchWith(pathname, {
				method,
				headers: headers({ origin: options.origin, 'content-type': 'application/json' }),
				...(body === undefined ? {} : { body: JSON.stringify(body) })
			}),
		adopt: (response) => {
			const issued = response.headers
				.getSetCookie()
				.find((value) => value.startsWith('fit_session='));
			if (issued !== undefined) cookie = issued.split(';')[0];
		},
		cookie: () => cookie
	};
}

async function jsonOf(response: Response): Promise<Record<string, unknown>> {
	try {
		return (await response.json()) as Record<string, unknown>;
	} catch {
		return {};
	}
}

async function checkSignInPage(client: Client): Promise<void> {
	const response = await client.get('/signin');
	const body = response.status === 200 ? await response.text() : '';
	const shell = body.includes(CLIENT_BUNDLE_PREFIX);
	check(
		'the sign-in page is served by this app',
		response.status === 200 && shell,
		`GET /signin -> ${response.status}${response.status === 200 && !shell ? ', but the body is not this app' : ''}`
	);
}

async function checkUnauthenticated(client: Client): Promise<void> {
	const response = await client.get('/api/sessions/current');
	const body = await jsonOf(response);
	const code = (body['error'] as { code?: string } | undefined)?.code;
	check(
		'anonymous session read is refused',
		response.status === 401 && code === 'unauthenticated',
		`GET /api/sessions/current -> ${response.status} ${code ?? '(no code)'}`
	);
}

type Credentials = { username: string; password: string };

function throwawayCredentials(): Credentials {
	return {
		username: `smoke.${Date.now()}.${randomBytes(3).toString('hex')}`,
		password: randomBytes(PASSWORD_BYTES).toString('base64url')
	};
}

async function checkRoundTrip(client: Client, credentials: Credentials): Promise<void> {
	const registered = await client.send('POST', '/api/accounts', {
		...credentials,
		displayName: 'Deploy smoke check',
		householdName: 'Deploy smoke check'
	});
	client.adopt(registered);
	check(
		'registration creates an account',
		registered.status === 201 && client.cookie() !== undefined,
		`POST /api/accounts -> ${registered.status} as ${credentials.username}`
	);

	const signedOut = await client.send('DELETE', '/api/sessions/current');
	check(
		'sign-out ends the registration session',
		signedOut.status === 204,
		`DELETE /api/sessions/current -> ${signedOut.status}`
	);

	const signedIn = await client.send('POST', '/api/sessions', credentials);
	client.adopt(signedIn);
	check(
		'sign-in returns a session',
		signedIn.status === 200,
		`POST /api/sessions -> ${signedIn.status}`
	);

	const current = await client.get('/api/sessions/current');
	const body = await jsonOf(current);
	const account = body['account'] as { username?: string } | undefined;
	check(
		'the session reads back as its own account',
		current.status === 200 && account?.username === credentials.username,
		`GET /api/sessions/current -> ${current.status} ${account?.username ?? '(no account)'}`
	);

	const revoked = await client.send('DELETE', '/api/sessions');
	check(
		'the smoke session is revoked',
		revoked.status === 204,
		`DELETE /api/sessions -> ${revoked.status}`
	);
}

/**
 * Which release is live.
 *
 * Read from the symlink over SSH rather than from an endpoint: an endpoint
 * that exists only to answer this is a route in the application, and this
 * question is about the machine.
 */
async function checkRelease(expected: string): Promise<void> {
	const live = (await remote(`readlink -f ${shellQuote(CURRENT_LINK)}`)).trim();
	const released = path.basename(live);
	check(
		'the live release is this commit',
		released === expected,
		`${CURRENT_LINK} -> ${released}, expected ${expected}`
	);
}

async function writeReport(ok: boolean, failure: string | undefined): Promise<void> {
	const directory = path.join(projectRoot, 'reports', 'deploy');
	await mkdir(directory, { recursive: true });
	const report = {
		ok,
		ranAt: new Date().toISOString(),
		passed,
		...(failure === undefined ? {} : { failure })
	};
	await writeFile(path.join(directory, 'smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
}

async function runChecks(options: Options): Promise<void> {
	const client = createClient(options);
	await checkSignInPage(client);
	await checkUnauthenticated(client);
	await checkRoundTrip(client, throwawayCredentials());
	await checkRelease(options.commit);
}

export async function smoke(argv: string[]): Promise<boolean> {
	const options = parseOptions(argv);
	if (options.commit === '') {
		options.commit = await capture('git', ['rev-parse', 'HEAD']);
	}
	let tunnel: ChildProcess | undefined;
	if (options.tunnel) {
		const port = await freePort();
		tunnel = await openTunnel(port);
		options.base = `http://127.0.0.1:${port}`;
	}
	let failure: string | undefined;
	try {
		await runChecks(options);
	} catch (error) {
		failure = error instanceof Error ? error.message : String(error);
	} finally {
		tunnel?.kill('SIGTERM');
	}
	for (const { name, detail } of passed) console.log(`  ok   ${name} — ${detail}`);
	if (failure !== undefined) console.error(`  FAIL ${failure}`);
	await writeReport(failure === undefined, failure);
	console.log(`Smoke check against ${options.base} (origin ${options.origin}).`);
	return failure === undefined;
}

if (import.meta.main) {
	process.exitCode = (await smoke(process.argv.slice(2))) ? 0 : 1;
}
