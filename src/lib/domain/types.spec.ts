import { describe, expect, it } from 'vitest';
import { DEFAULT_LOAD_UNIT, DEFAULT_UNITS } from './types';

describe('default unit constants', () => {
	it('opens the load unit on kilograms', () => {
		expect(DEFAULT_LOAD_UNIT).toBe('kg');
	});

	it('opens the units preference on metric', () => {
		expect(DEFAULT_UNITS).toBe('metric');
	});
});
