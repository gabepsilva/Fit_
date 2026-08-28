import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The native shell is a WebView around the same client bundle the browser gets.
 * `webDir` points at the adapter-static output rather than `build/`, which
 * belongs to adapter-node: the two targets must never overwrite each other.
 */
const config: CapacitorConfig = {
	appId: 'email.psilva.fit',
	appName: 'Fit_',
	webDir: 'build-capacitor'
};

export default config;
