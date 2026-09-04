import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBarcodeReader, PACKAGE_BARCODE_FORMATS } from './barcode-reader';

type Detected = { rawValue: string };

/** The frame handed to a detector; nothing in the reader looks inside it. */
const FRAME = {} as CanvasImageSource;

function install(detect: (source: CanvasImageSource) => Promise<Detected[]>) {
	const constructed: unknown[] = [];
	class FakeDetector {
		constructor(options: unknown) {
			constructed.push(options);
		}
		detect = detect;
	}
	Object.defineProperty(globalThis, 'BarcodeDetector', {
		value: FakeDetector,
		configurable: true,
		writable: true
	});
	return constructed;
}

afterEach(() => {
	Reflect.deleteProperty(globalThis, 'BarcodeDetector');
});

describe('createBarcodeReader', () => {
	it('offers nothing when the engine cannot read barcodes', () => {
		expect(createBarcodeReader()).toBeNull();
	});

	it('offers nothing when the engine refuses the formats a package carries', () => {
		Object.defineProperty(globalThis, 'BarcodeDetector', {
			value: class {
				constructor() {
					throw new TypeError('unsupported format');
				}
			},
			configurable: true,
			writable: true
		});
		expect(createBarcodeReader()).toBeNull();
	});

	it('asks only for the formats a food package carries', () => {
		const constructed = install(() => Promise.resolve([]));
		createBarcodeReader();
		expect(constructed[0]).toEqual({ formats: [...PACKAGE_BARCODE_FORMATS] });
	});

	it('names the one-dimensional package formats and not QR', () => {
		expect(PACKAGE_BARCODE_FORMATS).toContain('ean_13');
		expect(PACKAGE_BARCODE_FORMATS).toContain('upc_a');
		expect(PACKAGE_BARCODE_FORMATS).not.toContain('qr_code');
	});

	it('reads the first barcode in the frame', async () => {
		install(() => Promise.resolve([{ rawValue: '602652171032' }, { rawValue: '12345678' }]));
		await expect(createBarcodeReader()?.read(FRAME)).resolves.toBe('602652171032');
	});

	it('reads nothing from a frame with no barcode in it', async () => {
		install(() => Promise.resolve([]));
		await expect(createBarcodeReader()?.read(FRAME)).resolves.toBeNull();
	});

	it('skips a detection carrying no value rather than returning an empty code', async () => {
		install(() => Promise.resolve([{ rawValue: '' }, { rawValue: '602652171032' }]));
		await expect(createBarcodeReader()?.read(FRAME)).resolves.toBe('602652171032');
	});

	it('reads nothing from a frame the engine refuses, rather than throwing at the caller', async () => {
		install(() => Promise.reject(new DOMException('source is not ready')));
		await expect(createBarcodeReader()?.read(FRAME)).resolves.toBeNull();
	});

	it('keeps reading after a refused frame', async () => {
		const detect = vi
			.fn<(source: CanvasImageSource) => Promise<Detected[]>>()
			.mockRejectedValueOnce(new DOMException('source is not ready'))
			.mockResolvedValueOnce([{ rawValue: '602652171032' }]);
		install(detect);
		const reader = createBarcodeReader();
		await expect(reader?.read(FRAME)).resolves.toBeNull();
		await expect(reader?.read(FRAME)).resolves.toBe('602652171032');
	});
});
