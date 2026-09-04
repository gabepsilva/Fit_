import { describe, expect, it } from 'vitest';
import {
	BASE_PREVIEW_PORT,
	MAX_PREVIEW_WORKERS,
	previewDatabasePathForPort,
	previewPortForSlot
} from './e2e-workspace';

/**
 * The isolation invariant the parallel suite rests on: two workers never share
 * a port, and therefore never share a server, a database, or the
 * registration-throttle bucket inside it. A formula that collapsed two slots
 * onto one file would put the suite back on the shared state that forced
 * `workers: 1`, and would do it silently — every test would still pass until
 * two of them raced.
 */
describe('end-to-end worker workspaces', () => {
	const slots = Array.from({ length: MAX_PREVIEW_WORKERS }, (_, slot) => slot);

	it('gives every worker slot its own port', () => {
		const ports = slots.map(previewPortForSlot);
		expect(new Set(ports).size).toBe(slots.length);
	});

	it('gives every worker slot its own database file', () => {
		const paths = slots.map((slot) => previewDatabasePathForPort(previewPortForSlot(slot)));
		expect(new Set(paths).size).toBe(slots.length);
	});

	it('starts the block at the configured base port', () => {
		expect(previewPortForSlot(0)).toBe(BASE_PREVIEW_PORT);
	});

	it('refuses a slot outside the reserved block, rather than reaching another checkout', () => {
		expect(() => previewPortForSlot(MAX_PREVIEW_WORKERS)).toThrow(/beyond/);
	});

	it('refuses a slot that is not a whole count', () => {
		expect(() => previewPortForSlot(-1)).toThrow(/non-negative/);
		expect(() => previewPortForSlot(1.5)).toThrow(/non-negative/);
	});
});
