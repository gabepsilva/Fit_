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
					cleartext: developmentServer.startsWith('http://')
				}
			})
};

export default config;
