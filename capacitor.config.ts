import type { CapacitorConfig } from '@capacitor/cli';

/**
 * No tsconfig owns this file — it is read by the Capacitor CLI, and
 * `eslint.config.js` lints it against the default project — so `@types/node` is
 * out of scope here and `node:process` would resolve to `any`. Node types stay
 * scoped to `scripts/`, where they belong, and the one value this file needs is
 * declared instead.
 */
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

/**
 * The native shell is a WebView around the same client bundle the browser gets.
 * `webDir` points at the adapter-static output rather than `build/`, which
 * belongs to adapter-node: the two targets must never overwrite each other.
 */
/**
 * Where the WebView loads the app from, when that is not the bundled assets.
 *
 * The shipped build has no server: `webDir` is a static bundle and
 * `auth/api.ts` sends its requests to relative paths, so inside the WebView
 * those resolve against `capacitor://localhost` and reach nothing. Until the
 * bearer-token client that `origin-policy.ts` already provides for exists,
 * there is no build of this app that can talk to a backend somewhere else.
 *
 * Pointing the WebView at the server instead sidesteps that entirely: the app
 * is then served from the same origin it calls, so the relative paths resolve,
 * the browser attaches `Origin`, and the session cookie is set and returned
 * the way it is in any browser. That makes it a testing shell rather than a
 * shippable artifact — it needs the host reachable and running — which is why
 * it is an environment variable and never the default.
 *
 * It must be `https://`, or loopback over plain HTTP. `session-cookie.ts`
 * marks the cookie `Secure` for every host that is not loopback, so any other
 * cleartext host is handed a cookie the WebView drops on arrival and the
 * sign-in appears to work until the first reload. Loopback is the exception it
 * already carves out, and `adb reverse tcp:PORT tcp:PORT` makes the phone's own
 * `localhost` this machine — no DNS, no certificate, and nothing to resolve.
 */
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
	// Android blocks cleartext by default, which is the right default and the
	// reason this is derived rather than hardcoded: it is opened only for the
	// loopback URL the check above already restricted it to.
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
