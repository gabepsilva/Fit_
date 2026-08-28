/**
 * Server rendering is off for both targets. The Capacitor build has no Node
 * inside the WebView to do it, and the web build gained nothing from it: the
 * shell waits for `localStorage` before it renders anything, so every request
 * produced an empty page and then built the real one in the browser anyway.
 *
 * Turn it back on when a server can fill a page — that is the same change as
 * teaching the store to load from somewhere other than this device.
 */
export const ssr = false;
export const prerender = false;
