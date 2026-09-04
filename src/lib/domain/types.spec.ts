import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A module-level `const` only evaluates once per module instance, so a test
 * relying on an already-imported binding can end up with no coverage
 * credited to it under Stryker's per-test analysis — whichever test in the
 * whole run happened to trigger the very first import wins that credit, and
 * every other test importing the same module afterwards is not observed
 * touching the line at all. Resetting the module registry before each test
 * and re-importing forces a fresh evaluation the coverage instrumentation
 * attributes to *this* test, so the mutation lane's verdict does not depend
 * on run order.
 */
beforeEach(() => {
	vi.resetModules();
});

describe('default unit constants', () => {
	it('opens the load unit on kilograms', async () => {
		const { DEFAULT_LOAD_UNIT } = await import('./types');
		expect(DEFAULT_LOAD_UNIT).toBe('kg');
	});

	it('opens the units preference on metric', async () => {
		const { DEFAULT_UNITS } = await import('./types');
		expect(DEFAULT_UNITS).toBe('metric');
	});

	it('rests for ninety seconds by default, within a thirty-to-hundred-eighty range', async () => {
		const { DEFAULT_REST_SECONDS, MIN_REST_SECONDS, MAX_REST_SECONDS } = await import('./types');
		expect(DEFAULT_REST_SECONDS).toBe(90);
		expect(MIN_REST_SECONDS).toBe(30);
		expect(MAX_REST_SECONDS).toBe(180);
	});
});
