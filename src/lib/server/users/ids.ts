/**
 * A UUIDv7: 48 bits of millisecond timestamp, then randomness, so keys sort by
 * creation time and inserts stay at the B-tree's edge.
 * No shape validation: sync must adopt the `uid()` values devices already have.
 */
export function newId(now = Date.now()): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	const view = new DataView(bytes.buffer);
	// `>>> 0` takes the low 32 bits; the division carries the rest, good until 10889.
	view.setUint16(0, Math.floor(now / 2 ** 32));
	view.setUint32(2, now >>> 0);
	// Version 7 in the high nibble of byte 6, RFC 9562 variant in byte 8.
	view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x70);
	view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80);
	const hex = Buffer.from(bytes).toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
