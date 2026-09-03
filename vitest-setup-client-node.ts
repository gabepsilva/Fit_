/**
 * Node 26 ships native `localStorage`/`sessionStorage` that shadow jsdom's; this recovers jsdom's internal copies.
 * Repo pins Node 24 (`.tool-versions`); forward-compat only. Throws if storage is absent.
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
