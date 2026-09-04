import { describe, expect, it } from 'vitest';
import {
	DEFAULT_LOAD_UNIT,
	DEFAULT_REST_SECONDS,
	DEFAULT_UNITS,
	MAX_REST_SECONDS,
	MIN_REST_SECONDS
} from './types';

describe('default unit constants', () => {
	it('opens the load unit on kilograms', () => {
		expect(DEFAULT_LOAD_UNIT).toBe('kg');
	});

	it('opens the units preference on metric', () => {
		expect(DEFAULT_UNITS).toBe('metric');
	});

	it('rests for ninety seconds by default, within a thirty-to-hundred-eighty range', () => {
		expect(DEFAULT_REST_SECONDS).toBe(90);
		expect(MIN_REST_SECONDS).toBe(30);
		expect(MAX_REST_SECONDS).toBe(180);
	});
});
