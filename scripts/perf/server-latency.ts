import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { summarizeLatencies } from './server-latency-metrics.ts';
import type { EndpointLatency } from './server-latency-metrics.ts';

/**
 * Instrument 3: `GET /api/foods?q=` for every query `search:eval` uses, twice
 * each, and one `GET /api/foods/barcode`, all against a signed-in session on
 * a real preview server this script boots and tears down itself. Needs the
 * catalog those endpoints read; `serverLatency` reports `null` with why when
 * this machine does not have one, rather than measuring the
 * `catalog-unavailable` error path and calling that a latency number.
 */

const PORT = 4599;
const READY_TIMEOUT_MS = 60_000;
const WARM_PASSES = 2;

async function waitUntilServing(port: number, server: ChildProcess): Promise<void> {
	const deadline = Date.now() + READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (server.exitCode !== null) throw new Error(`Preview server on port ${port} exited early.`);
		try {
			const response = await fetch(`http://127.0.0.1:${port}/`);
			if (response.ok) return;
		} catch {
			// Not listening yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	throw new Error(`Preview server on port ${port} was not serving in time.`);
}

function stop(server: ChildProcess): Promise<void> {
	return new Promise((resolve) => {
		if (server.exitCode !== null || server.pid === undefined) {
			resolve();
			return;
		}
		server.once('exit', () => resolve());
		try {
			process.kill(-server.pid, 'SIGTERM');
		} catch {
			server.kill('SIGTERM');
		}
	});
}

/** The `Set-Cookie` value a session-creating response carries, stripped of its attributes. */
function sessionCookieFrom(response: Response): string {
	const header = response.headers.get('set-cookie');
	if (header === null) throw new Error('Response carried no Set-Cookie header.');
	const pair = header.split(';')[0];
	if (pair === undefined) throw new Error('Set-Cookie header was empty.');
	return pair;
}

/** Registers a throwaway account and returns the cookie header later requests authenticate with. */
async function signIn(baseURL: string): Promise<string> {
	const response = await fetch(`${baseURL}/api/accounts`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin: baseURL },
		body: JSON.stringify({
			username: `perf-${randomUUID().slice(0, 13)}`,
			displayName: 'Perf',
			password: 'salt-and-pepper-mill',
			householdName: 'Perf'
		})
	});
	if (response.status !== 201) {
		throw new Error(`Registration failed with status ${response.status}.`);
	}
	return sessionCookieFrom(response);
}

/** One request's wall time, discarding the body. */
async function timed(baseURL: string, path: string, cookie: string): Promise<number> {
	const started = performance.now();
	const response = await fetch(`${baseURL}${path}`, { headers: { cookie } });
	await response.json();
	if (!response.ok) throw new Error(`${path} answered ${response.status}.`);
	return performance.now() - started;
}

type SearchFixture = { queries: { query: string }[] };

/** A GTIN-14 this catalog actually carries, found by searching until one turns up. */
async function findKnownBarcode(
	baseURL: string,
	cookie: string,
	queries: string[]
): Promise<string> {
	for (const query of queries) {
		const response = await fetch(`${baseURL}/api/foods?q=${encodeURIComponent(query)}`, {
			headers: { cookie }
		});
		const body = (await response.json()) as { foods: { barcode: string | null }[] };
		const found = body.foods.find((food) => food.barcode !== null);
		if (found?.barcode) return found.barcode;
	}
	throw new Error('No search query returned a food carrying a barcode.');
}

export interface ServerLatencyResult {
	rows: EndpointLatency[] | null;
	skipReason: string | null;
}

/** `null` with why, on a machine with no catalog installed; the measured rows, otherwise. */
export async function measureServerLatency(
	root: string,
	catalogPath: () => string,
	catalogExists: (path: string) => boolean = existsSync
): Promise<ServerLatencyResult> {
	if (!catalogExists(catalogPath())) {
		return {
			rows: null,
			skipReason: `no catalog file at ${catalogPath()} — /api/foods and /api/foods/barcode need one`
		};
	}

	const fixture = JSON.parse(
		await readFile(path.join(root, 'data', 'eval', 'search-queries.json'), 'utf8')
	) as SearchFixture;
	const queries = fixture.queries.map((entry) => entry.query);

	const runtimeDirectory = await mkdtemp(path.join(tmpdir(), 'fit-perf-server-'));
	const databasePath = path.join(runtimeDirectory, 'app.sqlite');
	const server = spawn(
		'bun',
		['run', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
		{
			cwd: root,
			env: { ...process.env, FIT_DB_PATH: databasePath },
			detached: true,
			stdio: 'ignore'
		}
	);
	try {
		await waitUntilServing(PORT, server);
		const baseURL = `http://127.0.0.1:${PORT}`;
		const cookie = await signIn(baseURL);

		const searchSamples: number[] = [];
		for (let pass = 0; pass < WARM_PASSES; pass += 1) {
			for (const query of queries) {
				searchSamples.push(
					await timed(baseURL, `/api/foods?q=${encodeURIComponent(query)}`, cookie)
				);
			}
		}

		const barcode = await findKnownBarcode(baseURL, cookie, queries);
		const barcodeSamples: number[] = [];
		for (let pass = 0; pass < WARM_PASSES; pass += 1) {
			barcodeSamples.push(
				await timed(baseURL, `/api/foods/barcode?code=${encodeURIComponent(barcode)}`, cookie)
			);
		}

		return {
			rows: [
				summarizeLatencies('GET /api/foods', searchSamples),
				summarizeLatencies('GET /api/foods/barcode', barcodeSamples)
			],
			skipReason: null
		};
	} finally {
		await stop(server);
		await rm(runtimeDirectory, { recursive: true, force: true });
	}
}
