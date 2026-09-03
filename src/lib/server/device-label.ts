/**
 * What a session row is called in a list of them.
 *
 * `sessions.ts` says why sessions are rows: a phone that gets lost has to be
 * revocable on its own, and that only works if the rows can be told apart.
 * `device_label` is what tells them apart. Asking the person for the name at
 * the sign-in prompt was the first attempt and the wrong one — it interrupts
 * someone trying to get in, to answer a question about a screen that does not
 * exist yet. The request already carries the answer.
 *
 * The raw `User-Agent` is not that answer. It is a hundred characters of
 * compatibility fiction nobody reads, it is written by the caller, and it would
 * be rendered back into a page the account owner is looking at. So no part of
 * the header is stored: it is matched against the vocabulary below and the
 * label is assembled from constants. A header matching nothing yields `null`
 * and the column stays empty, which is the honest answer and the one every
 * existing row already holds.
 *
 * The Capacitor build needs no special case. Its WebView sends a Chrome
 * `User-Agent` like any other Android browser and lands on the same label.
 */

/** A substring to look for, and the word to say when it is there. */
type Vocabulary = readonly (readonly [token: string, name: string])[];

/**
 * Most specific first, because these strings deliberately impersonate each
 * other: every Chromium browser claims `Safari`, and Edge, Opera and Samsung
 * Internet claim `Chrome` on top of that. The iOS builds of Chrome, Firefox and
 * Edge claim neither under their own name, which is what `CriOS`, `FxiOS` and
 * `EdgiOS` are for. Matching in this order is what makes each token mean what
 * it says.
 *
 * Every token here is one a browser sends alone. `Chromium/` is not among them
 * for that reason — the browsers that send it send `Chrome/` beside it, so the
 * entry could never be the one that decided an answer.
 */
const BROWSERS: Vocabulary = [
	['Edg/', 'Edge'],
	['EdgA/', 'Edge'],
	['EdgiOS/', 'Edge'],
	['OPR/', 'Opera'],
	['SamsungBrowser/', 'Samsung Internet'],
	['Firefox/', 'Firefox'],
	['FxiOS/', 'Firefox'],
	['Chrome/', 'Chrome'],
	['CriOS/', 'Chrome'],
	['Safari/', 'Safari']
];

/**
 * Ordered for the same reason. An Android header opens `Linux; Android`, and an
 * iPhone one says `like Mac OS X`; the narrower name has to win both times.
 *
 * `Mac OS X` rather than `Macintosh` because it is the token every Mac browser
 * sends — `Macintosh` would only ever agree with a decision this one had made
 * already.
 */
const PLATFORMS: Vocabulary = [
	['Android', 'Android'],
	['iPhone', 'iPhone'],
	['iPad', 'iPad'],
	['CrOS', 'ChromeOS'],
	['Mac OS X', 'Mac'],
	['Windows', 'Windows'],
	['Linux', 'Linux']
];

function firstMatch(vocabulary: Vocabulary, userAgent: string): string | null {
	for (const [token, name] of vocabulary) {
		if (userAgent.includes(token)) return name;
	}
	return null;
}

/**
 * "Chrome on Android", or as much of it as the header supports.
 *
 * Half an answer is still worth storing — "Firefox" tells two rows apart when
 * the other one is Safari — so a browser without a platform, or a platform
 * without a browser, is a label. Neither is not.
 */
export function deviceLabelFrom(userAgent: string | null): string | null {
	if (userAgent === null) return null;
	const browser = firstMatch(BROWSERS, userAgent);
	const platform = firstMatch(PLATFORMS, userAgent);
	if (browser !== null && platform !== null) return `${browser} on ${platform}`;
	return browser ?? platform;
}
