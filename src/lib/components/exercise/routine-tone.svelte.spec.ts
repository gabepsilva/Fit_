import { describe, expect, it } from 'vitest';
import { REST_TONE, routineLetter, routineTone } from './routine-tone';

describe('routine tones', () => {
	it('gives the first three routines colors of their own', () => {
		const tones = [routineTone(0), routineTone(1), routineTone(2)];
		expect(new Set(tones.map((t) => t.solid)).size).toBe(3);
		expect(new Set(tones.map((t) => t.ink)).size).toBe(3);
	});

	it('gives every tone a filled, a washed and a bare form', () => {
		for (const index of [0, 1, 2]) {
			const tone = routineTone(index);
			expect(tone.solid.length).toBeGreaterThan(0);
			expect(tone.tint.length).toBeGreaterThan(0);
			expect(tone.ink.length).toBeGreaterThan(0);
		}
	});

	it('starts the palette again for a fourth routine', () => {
		expect(routineTone(3)).toEqual(routineTone(0));
		expect(routineTone(4)).toEqual(routineTone(1));
	});

	it('gives a rest week the quiet non-color rather than a fourth palette entry', () => {
		expect(routineTone(-1)).toEqual(REST_TONE);
		expect(REST_TONE.ink).toBe('text-muted-foreground');
		expect(routineTone(0)).not.toEqual(REST_TONE);
	});
});

describe('the letter that stands in for a routine', () => {
	it('is the initial, in upper case', () => {
		expect(routineLetter('Legs')).toBe('L');
		expect(routineLetter('push')).toBe('P');
	});

	it('ignores space around the name', () => {
		expect(routineLetter('  Back & Arms')).toBe('B');
	});

	it('falls back to a dot when there is no name to take an initial from', () => {
		expect(routineLetter('')).toBe('·');
		expect(routineLetter('   ')).toBe('·');
	});
});
