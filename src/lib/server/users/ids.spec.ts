import { describe, expect, it } from 'vitest';
import { newId } from './ids';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The 48-bit millisecond timestamp UUIDv7 puts in the leading six bytes. */
function timestampOf(id: string) {
	return Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16);
}

describe('newId', () => {
	it('formats a canonical UUID', () => {
		expect(newId()).toMatch(UUID);
	});

	it('declares version 7', () => {
		expect(newId().charAt(14)).toBe('7');
	});

	it('sets the RFC 9562 variant bits', () => {
		expect(['8', '9', 'a', 'b']).toContain(newId().charAt(19));
	});

	it('encodes the millisecond it was made', () => {
		const now = Date.UTC(2026, 7, 29, 12, 0, 0);
		expect(timestampOf(newId(now))).toBe(now);
	});

	it('encodes a timestamp above the 32-bit boundary without losing the high bits', () => {
		const now = 2 ** 32 + 12345;
		expect(timestampOf(newId(now))).toBe(now);
	});

	it('sorts by creation time, which is the reason for v7 over v4', () => {
		const earlier = newId(1_700_000_000_000);
		const later = newId(1_800_000_000_000);
		expect(earlier < later).toBe(true);
	});

	it('does not repeat itself within a millisecond', () => {
		const now = Date.now();
		expect(newId(now)).not.toBe(newId(now));
	});
});
