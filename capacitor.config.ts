import type { CapacitorConfig } from '@capacitor/cli';

// No tsconfig owns this file; declare the one Node global it needs.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

// `webDir` points at adapter-static output, not `build/` (adapter-node): the two must not overwrite each other.
//
// FIT_CAPACITOR_SERVER_URL points the WebView at a live server for testing.
// Must be https:// or loopback http:// — `session-cookie.ts` marks the cookie Secure for non-loopback hosts,
// so other cleartext hosts would silently drop the cookie.
const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const developmentServer = process.env.FIT_CAPACITOR_SERVER_URL;
if (
	developmentServer !== undefined &&
	!developmentServer.startsWith('https://') &&
	!LOOPBACK.test(developmentServer)
) {
	throw new Error(
		`FIT_CAPACITOR_SERVER_URL must be an https:// origin or http://localhost; "${developmentServer}" is neither.`
	);
}

const config: CapacitorConfig = {
	appId: 'email.psilva.fit',
	appName: 'Fit_',
	webDir: 'build-capacitor',
	// Cleartext is opened only for the loopback URL validated above.
	...(developmentServer === undefined
		? {}
		: {
				server: {
					url: developmentServer,
					cleartext: developmentServer.startsWith('http://'),
					// What the WebView shows when that URL does not answer.
					//
					// Setting `url` means the bundle in `webDir` is never loaded: the
					// WebView navigates to the host and every asset comes from there. A
					// stopped server is therefore a failed navigation rather than a
					// failed request, and the default for that is Chrome's own
					// `ERR_CONNECTION_REFUSED` interstitial -- a browser error page
					// inside something that is not meant to look like a browser.
					//
					// The path is resolved inside `webDir`, and `static/` is copied to
					// its root by adapter-static, so the file ships with every build.
					// It is only ever reached from this shell: a default build has no
					// `server` block, so nothing points at it.
					//
					// The fragment is how that page learns where to retry, and it is
					// carried this way because nothing else can carry it. Capacitor
					// serves the error page from its *local* origin -- `getErrorUrl`
					// builds `scheme://host/errorPath` from the app's own scheme and
					// host, not from this URL -- so the page has no way to derive the
					// server it was meant to reach, and `location.reload()` merely
					// re-requests the error page itself.
					//
					// That reload is not simply useless, it is harmful: `launchIntent`
					// hands any navigation whose host *or* scheme differs from this URL
					// to `Intent.ACTION_VIEW`, and the local origin differs from every
					// server URL in at least one of the two -- in scheme here, in host
					// for a hosted origin. Retrying therefore threw the user out into
					// the system browser. Navigating to this value instead matches on
					// both counts, so the WebView keeps it.
					//
					// `getErrorUrl` concatenates without escaping, and a fragment is
					// never sent to a server, so it reaches the page intact and the
					// local server still serves the plain path.
					errorPath: `server-offline.html#${encodeURIComponent(developmentServer)}`
				}
			})
};

export default config;
