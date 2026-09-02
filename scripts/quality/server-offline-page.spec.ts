import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * The offline page decides, on its own, whether to navigate somewhere the URL
 * told it to go. That is a redirect, and `static/` is copied into the web build
 * as well as the Capacitor one, so on the deployed site the fragment is written
 * by whoever composed the link rather than by the build. The page answers that
 * by believing the fragment only on Capacitor's local origin.
 *
 * The rule is one branch inside an inline `<script>`: the page has to render
 * with the network gone, so it cannot import a module, and there is nothing to
 * unit test in the ordinary way. It is still the difference between a retry
 * button and an open redirect wearing the app's own branding, so the script is
 * read out of the shipped file and run here rather than trusted by inspection.
 */

const PAGE = new URL('../../static/server-offline.html', import.meta.url);

function inlineScript(): string {
	const html = readFileSync(PAGE, 'utf8');
	const body = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
	// A page that stopped carrying its script would otherwise pass every
	// assertion below by never running any of them.
	if (body === undefined) throw new Error('server-offline.html has no inline script');
	return body;
}

type Node = {
	removed: boolean;
	hidden: boolean;
	disabled: boolean;
	textContent: string;
	listeners: Map<string, () => void>;
	remove: () => void;
	addEventListener: (name: string, run: () => void) => void;
};

function node(): Node {
	const created: Node = {
		removed: false,
		hidden: true,
		disabled: false,
		textContent: '',
		listeners: new Map(),
		remove: () => {
			created.removed = true;
		},
		addEventListener: (name, run) => {
			created.listeners.set(name, run);
		}
	};
	return created;
}

type Rendered = {
	retry: Node;
	fallback: Node;
	/** Where the page sent the WebView, or `null` if it refused to send it anywhere. */
	navigated: () => string | null;
	press: () => void;
	reconnect: () => void;
};

/** Run the script the page actually ships, against one hostname and fragment. */
function render(hostname: string, hash: string): Rendered {
	const retry = node();
	const fallback = node();
	const windowListeners = new Map<string, () => void>();
	let replaced: string | null = null;

	const window = {
		location: {
			hostname,
			hash,
			replace: (url: string) => {
				replaced = url;
			}
		},
		addEventListener: (name: string, run: () => void) => {
			windowListeners.set(name, run);
		}
	};
	const document = {
		getElementById: (id: string) => (id === 'retry' ? retry : fallback)
	};

	runInNewContext(inlineScript(), { window, document, URL });

	return {
		retry,
		fallback,
		navigated: () => replaced,
		press: () => retry.listeners.get('click')?.(),
		reconnect: () => windowListeners.get('online')?.()
	};
}

const HOSTILE = `#${encodeURIComponent('https://elsewhere.example')}`;
const SERVER = 'http://localhost:5173';
const BUILT = `#${encodeURIComponent(SERVER)}`;

describe('the offline page decides where "Try again" may go', () => {
	it('refuses a fragment on a deployed host, where anyone can write one', () => {
		const page = render('fit.example', HOSTILE);
		page.press();
		expect(page.navigated()).toBeNull();
		expect(page.retry.removed).toBe(true);
		expect(page.fallback.hidden).toBe(false);
	});

	it('refuses it on a loopback address that is not the local origin either', () => {
		// Capacitor's origin is `localhost` by name. `127.0.0.1` reaches the same
		// machine but is not that origin, and the web build can be served there.
		const page = render('127.0.0.1', HOSTILE);
		// Pressed rather than merely inspected: a refusal nobody asked for is not a
		// refusal, and this assertion held with the hostname branch deleted until
		// the press was added.
		page.press();
		expect(page.navigated()).toBeNull();
	});

	it('follows the fragment the build wrote, on the local origin', () => {
		const page = render('localhost', BUILT);
		page.press();
		expect(page.navigated()).toBe(`${SERVER}/`);
		expect(page.retry.disabled).toBe(true);
	});

	it('recovers on its own when the device rejoins a network', () => {
		const page = render('localhost', BUILT);
		page.reconnect();
		expect(page.navigated()).toBe(`${SERVER}/`);
	});

	it('refuses a scheme that is neither http nor https', () => {
		const page = render('localhost', `#${encodeURIComponent('javascript:void 0')}`);
		page.press();
		expect(page.navigated()).toBeNull();
	});

	it('offers no button at all when there is no fragment to follow', () => {
		const page = render('localhost', '');
		expect(page.retry.removed).toBe(true);
		expect(page.fallback.hidden).toBe(false);
	});
});
