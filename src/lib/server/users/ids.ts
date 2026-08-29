/**
 * A UUIDv7: 48 bits of millisecond timestamp, then randomness.
 *
 * Time-ordered rather than random (v4) because these become primary keys, and
 * a key that sorts by creation time keeps inserts at the right-hand edge of the
 * B-tree instead of scattering them across it.
 *
 * The client generates its own ids for the rows it creates offline, and the
 * store already has `uid()` values sitting in people's `localStorage`. Nothing
 * here validates the shape of an id, so the first sync can adopt what a device
 * already has rather than renumbering it.
 */
export function newId(now = Date.now()): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	const view = new DataView(bytes.buffer);
	// `>>> 0` takes the low 32 bits; the division carries the rest, which leaves
	// room until the year 10889.
	view.setUint16(0, Math.floor(now / 2 ** 32));
	view.setUint32(2, now >>> 0);
	// Version 7 in the high nibble of byte 6, RFC 9562 variant in byte 8.
	view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x70);
	view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80);
	const hex = Buffer.from(bytes).toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
