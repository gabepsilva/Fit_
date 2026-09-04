import { env } from 'node:process';

/**
 * Where one end-to-end worker's app lives: its port, and the database only it
 * writes to.
 *
 * The suite used to share a single preview server, a single SQLite file and, in
 * consequence, a single registration-throttle bucket keyed on 127.0.0.1 — so it
 * ran one worker at a time and cleared that shared table before every test.
 * Both of those are cross-worker mutations. A port and a file per worker
 * removes the sharing instead of running one worker at a time around it, and leaves the throttle
 * clearing as a purely local reset of the worker's own database.
 */

/** Highest worker slot the block has room for before it could reach another checkout's. */
export const MAX_PREVIEW_WORKERS = 16;

function readBasePort(configured: string | undefined): number {
	if (configured === undefined) return 4173;
	if (!/^\d+$/.test(configured)) throw new Error('FIT_PREVIEW_PORT must be numeric.');
	const port = Number(configured);
	if (port < 1024 || port > 65_535 - MAX_PREVIEW_WORKERS) {
		throw new Error(`FIT_PREVIEW_PORT must leave room for ${MAX_PREVIEW_WORKERS} workers.`);
	}
	return port;
}

/** The first port of the block; a checkout may move the block with FIT_PREVIEW_PORT. */
export const BASE_PREVIEW_PORT = readBasePort(env.FIT_PREVIEW_PORT);

/**
 * The port for a worker slot. Playwright's `parallelIndex` is the slot, not the
 * worker: it is reused when a worker is replaced after a failure, so a retry
 * reclaims the port and the database its predecessor held rather than leaking a
 * new pair on every restart.
 */
export function previewPortForSlot(parallelIndex: number): number {
	if (!Number.isInteger(parallelIndex) || parallelIndex < 0) {
		throw new Error(`Worker slot must be a non-negative integer, got ${String(parallelIndex)}.`);
	}
	if (parallelIndex >= MAX_PREVIEW_WORKERS) {
		throw new Error(`Worker slot ${parallelIndex} is beyond the ${MAX_PREVIEW_WORKERS} reserved.`);
	}
	return BASE_PREVIEW_PORT + parallelIndex;
}

/** The database that worker's server owns. Named after the port so the pair is visible on disk. */
export function previewDatabasePathForPort(port: number): string {
	return `data/runtime/e2e-${port}.sqlite`;
}
