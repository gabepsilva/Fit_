/**
 * Node 26 ships its own `localStorage`/`sessionStorage` globals, and they read
 * as `undefined` unless the process was started with `--localstorage-file`.
 * Vitest's jsdom environment copies only the window keys that are not already
 * on `globalThis`, so Node's placeholder wins and jsdom's real `Storage` never
 * arrives — every spec that persists through storage then fails on a runtime
 * this repository does not pin (`.tool-versions` pins node 24.18.0, which has
 * no such global and needs none of this).
 *
 * jsdom's own storage objects are copied across under their internal names, so
 * put them back where the DOM says they belong. Anything unexpected throws:
 * a spec that persists must never quietly run against storage that forgets.
 */
function jsdomStorage(key: 'localStorage' | 'sessionStorage'): Storage {
	const internal = (globalThis as Record<string, unknown>)[`_${key}`];
	if (internal === null || typeof internal !== 'object' || !('setItem' in internal)) {
		throw new Error(`The jsdom test environment supplied no ${key}.`);
	}
	return internal as Storage;
}

for (const key of ['localStorage', 'sessionStorage'] as const) {
	if (globalThis[key] !== undefined) continue;
	Object.defineProperty(globalThis, key, {
		configurable: true,
		writable: true,
		value: jsdomStorage(key)
	});
}
