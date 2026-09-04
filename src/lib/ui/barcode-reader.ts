/**
 * Reading a barcode out of a camera frame, using the engine's own detector.
 *
 * `BarcodeDetector` is Chromium's, which is what the Android WebView and the
 * mobile browsers this app targets run; Safari has no implementation. There is
 * no decoding library behind this on purpose — one costs hundreds of kilobytes
 * against a client budget of 412 kB — so an engine without a detector reads
 * `null` here and the scan pane offers the digits to type instead.
 */

/**
 * The one-dimensional formats a food package carries. QR and Data Matrix
 * are left out: asking for a format widens what every frame is searched for,
 * and nothing in a grocery aisle answers on them.
 */
export const PACKAGE_BARCODE_FORMATS = [
	'ean_13',
	'ean_8',
	'upc_a',
	'upc_e',
	'code_128',
	'itf'
] as const;

export type BarcodeReader = {
	/** The first barcode in the frame, or `null` when there is none to read. */
	read: (source: CanvasImageSource) => Promise<string | null>;
};

type DetectorLike = {
	detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

type DetectorConstructor = new (options: { formats: string[] }) => DetectorLike;

/** A reader, or `null` when this engine cannot read barcodes at all. */
export function createBarcodeReader(): BarcodeReader | null {
	const Detector = (globalThis as unknown as { BarcodeDetector?: DetectorConstructor })
		.BarcodeDetector;

	let detector: DetectorLike;
	try {
		// There is no separate "is there a detector" test: `undefined` is not a
		// constructor, so an engine without one throws here exactly as an engine
		// that refuses a format does, and both mean the same thing to the caller.
		detector = new (Detector as DetectorConstructor)({ formats: [...PACKAGE_BARCODE_FORMATS] });
	} catch {
		return null;
	}

	return {
		read: async (source) => {
			let found: { rawValue: string }[];
			try {
				found = await detector.detect(source);
			} catch {
				// A frame arriving before the video has one throws; the next one will not.
				return null;
			}
			return found.find((code) => code.rawValue !== '')?.rawValue ?? null;
		}
	};
}
