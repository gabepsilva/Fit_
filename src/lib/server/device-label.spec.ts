import { describe, expect, it } from 'vitest';
import { deviceLabelFrom } from './device-label';

/** The header the web build sends from the phone the Android build also runs on. */
const ANDROID_CHROME =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

/**
 * Real headers, copied rather than composed, one per token the module knows.
 *
 * A `User-Agent` is a pile of historical claims — every Chromium browser says
 * `Safari`, Edge and Opera and Samsung Internet say `Chrome` as well — so a
 * fixture written from what the parser expects would agree with a parser that
 * read them in the wrong order. Each of these carries the tokens a real browser
 * actually sends, which is what makes the order it reads them in observable.
 */
const HEADERS: readonly (readonly [agent: string, label: string])[] = [
	[
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68',
		'Edge on Windows'
	],
	[
		'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.2592.68',
		'Edge on Android'
	],
	[
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 EdgiOS/126.2592.68 Mobile/15E148 Safari/605.1.15',
		'Edge on iPhone'
	],
	[
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0',
		'Opera on Windows'
	],
	[
		'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
		'Samsung Internet on Android'
	],
	['Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0', 'Firefox on Linux'],
	[
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
		'Firefox on iPhone'
	],
	[ANDROID_CHROME, 'Chrome on Android'],
	[
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
		'Chrome on iPhone'
	],
	[
		'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
		'Chrome on ChromeOS'
	],
	[
		'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
		'Safari on iPad'
	],
	[
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
		'Safari on Mac'
	]
];

/** The Android build's WebView, which is the client the label mattered for first. */
const CAPACITOR_WEBVIEW =
	'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.43 Mobile Safari/537.36';

describe('deviceLabelFrom', () => {
	it.each(HEADERS)('reads %s as "%s"', (agent, label) => {
		expect(deviceLabelFrom(agent)).toBe(label);
	});

	it('reads the Capacitor WebView as the Android browser it reports itself to be', () => {
		expect(deviceLabelFrom(CAPACITOR_WEBVIEW)).toBe('Chrome on Android');
	});

	it('says nothing at all when a request carries no header', () => {
		expect(deviceLabelFrom(null)).toBeNull();
	});

	it('says nothing for a header naming nothing it knows', () => {
		expect(deviceLabelFrom('curl/8.8.0')).toBeNull();
	});

	it('keeps the half of an answer a header does support', () => {
		expect(deviceLabelFrom('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('Android');
		expect(deviceLabelFrom('Firefox/127.0')).toBe('Firefox');
	});

	/**
	 * The header is written by the caller and the label is rendered back to the
	 * account owner, so none of it may reach the column. Matching a vocabulary
	 * and answering with constants is what guarantees that, and this is the case
	 * that would notice the day someone interpolates the header instead.
	 */
	it('stores none of the text the caller wrote', () => {
		expect(deviceLabelFrom(`${ANDROID_CHROME} <script>alert(1)</script>`)).toBe(
			'Chrome on Android'
		);
	});
});
