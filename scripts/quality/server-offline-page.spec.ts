import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

type Page = { script: string; ids: ReadonlySet<string> };

/**
 * The script the page ships, and the element ids the page actually declares.
 *
 * Both come out of the same read, because the point is to hold them together.
 * Stubbing `getElementById` to answer anything would test the branch while
 * saying nothing about whether it is wired to the markup: a misspelled `id`
 * would break the real page and leave this suite green. Serving only the ids
 * the file declares makes a lookup for an element that is not there return
 * `null`, which is what the browser does, and the script then fails here the
 * way it would on the phone.
 */
function page(): Page {
	const html = readFileSync(PAGE, 'utf8');
	const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
	// Exactly one, rather than the first of however many. Taking `[0]` silently
	// picked a block if a second were ever added, and a page whose script had
	// gone missing would pass every assertion below by running none of them.
	const script = blocks.length === 1 ? blocks[0] : undefined;
	if (script === undefined)
		throw new Error(`server-offline.html carries ${blocks.length} inline scripts; expected 1.`);
	const ids = [...html.matchAll(/\sid="([^"]+)"/g)].flatMap((match) =>
		match[1] === undefined ? [] : [match[1]]
	);
	return { script, ids: new Set(ids) };
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
	const { script, ids } = page();
	const nodes = new Map<string, Node>();
	for (const id of ids) nodes.set(id, node());

	const named = (id: string): Node => {
		const found = nodes.get(id);
		// The page stopped declaring an element this suite reasons about, so the
		// assertions below no longer mean what they say.
		if (found === undefined) throw new Error(`server-offline.html declares no id "${id}".`);
		return found;
	};

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
		getElementById: (id: string) => nodes.get(id) ?? null
	};

	runInNewContext(script, { window, document, URL });

	const retry = named('retry');
	return {
		retry,
		fallback: named('fallback'),
		navigated: () => replaced,
		press: () => retry.listeners.get('click')?.(),
		reconnect: () => windowListeners.get('online')?.()
	};
}

const SERVER_URL_VARIABLE = 'FIT_CAPACITOR_SERVER_URL';

/**
 * The Capacitor config as a build with a development server resolves it.
 *
 * Imported rather than described, because the page and the config hold one
 * contract between them and nothing else checks it. The config decides where
 * the error page is reached and what it is told; the page decides what it will
 * believe. Restating either here would test the restatement.
 */
async function capacitorConfig(serverUrl: string) {
	process.env[SERVER_URL_VARIABLE] = serverUrl;
	vi.resetModules();
	return (await import('../../capacitor.config')).default;
}

afterEach(() => {
	delete process.env[SERVER_URL_VARIABLE];
	vi.resetModules();
});

describe('the config and the page agree on how a retry is reached', () => {
	it('hands the page the server URL, and the page follows it back', async () => {
		const config = await capacitorConfig(SERVER);
		const errorPath = config.server?.errorPath;
		if (errorPath === undefined) throw new Error('the development shell set no errorPath.');
		// Split the way Capacitor's `getErrorUrl` leaves it: the local server is
		// asked for the path, and the fragment rides along to the page untouched.
		const [path, fragment] = errorPath.split('#');
		expect(path).toBe('server-offline.html');
		const rendered = render('localhost', `#${fragment ?? ''}`);
		rendered.press();
		// Not an assertion about the encoding, which is the config's business, but
		// about the round trip: what the config wrote, the page arrived at.
		expect(rendered.navigated()).toBe(`${SERVER}/`);
	});

	it('encodes the server URL so that one fragment stays one fragment', async () => {
		// A loopback URL cannot contain a `#` -- the config's own check forbids a
		// path on one -- so the encoding looks redundant until the server is a
		// real origin, which may carry one legitimately. Unencoded, that `#` ends
		// the fragment early and the page navigates to a truncated address.
		const config = await capacitorConfig('https://fit.example/#start');
		expect(config.server?.errorPath?.split('#')).toHaveLength(2);
	});

	it('serves the app from the host the page is willing to trust', async () => {
		// The page believes its fragment only on `localhost`, because that is the
		// host Capacitor serves the app from. `server.hostname` can move it, and
		// nothing about that change would look like it touched the error page --
		// the retry button would simply stop being offered, silently and for the
		// first time on someone's phone. It is a default, so it is absent here;
		// setting it means updating the guard the page applies.
		const config = await capacitorConfig(SERVER);
		expect(config.server?.hostname).toBeUndefined();
	});

	it('points the error page at a file the build actually ships', async () => {
		const config = await capacitorConfig(SERVER);
		const [path] = (config.server?.errorPath ?? '').split('#');
		expect(existsSync(new URL(`../../static/${path}`, import.meta.url))).toBe(true);
	});
});

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
