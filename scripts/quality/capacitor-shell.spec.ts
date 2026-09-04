import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The Android shell's Java, held to the one invariant behind issue #59: a
 * request the person did not make must not be able to replace the running app
 * with the offline page.
 *
 * The behavior itself is tested where it lives, in
 * `android/app/src/test/java/email/psilva/fit/SpeculativeRequestsTest.java`,
 * which runs on the JVM under `cd android && ./gradlew testDebugUnitTest`. CI
 * has no Android toolchain and no JDK, so that suite cannot gate a pull
 * request; this one can, and it pins the wiring that suite cannot see —
 * that the shell installs its own client at all, and that neither error
 * callback can reach Capacitor's navigation without asking the question first.
 *
 * A structural test is a weak instrument and is used here only because the
 * alternative is no gate at all on the file that broke.
 */

const shell = (name: string) =>
	readFileSync(
		new URL(`../../android/app/src/main/java/email/psilva/fit/${name}`, import.meta.url),
		'utf8'
	);

/**
 * The body of a Java method, by brace matching from its signature. Comments in
 * these files talk about `super.onReceivedHttpError` and `loadUrl` at length,
 * so a whole-file search would find what it was looking for in prose.
 */
function methodBody(source: string, signature: string): string {
	const start = source.indexOf(signature);
	if (start === -1) throw new Error(`no method matching "${signature}".`);
	const open = source.indexOf('{', start);
	if (open === -1) throw new Error(`"${signature}" has no body.`);
	let depth = 0;
	for (let index = open; index < source.length; index += 1) {
		if (source[index] === '{') depth += 1;
		else if (source[index] === '}') {
			depth -= 1;
			if (depth === 0) return source.slice(open + 1, index);
		}
	}
	throw new Error(`"${signature}" has an unbalanced body.`);
}

describe('the Android shell ignores failures of requests nobody made', () => {
	it("installs its own WebViewClient instead of Capacitor's", () => {
		// Without this line every override below is dead code, which is exactly
		// the state the app shipped in.
		const body = methodBody(shell('MainActivity.java'), 'protected void onCreate');
		expect(body).toContain('bridge.setWebViewClient(new ShellWebViewClient(bridge))');
	});

	it.each(['public void onReceivedError', 'public void onReceivedHttpError'])(
		'guards %s before delegating to Capacitor',
		(signature) => {
			// Both callbacks matter: a refused prefetch arrives as an HTTP status,
			// a prefetch to an unreachable host as a network error.
			const body = methodBody(shell('ShellWebViewClient.java'), signature);
			const guard = body.indexOf('isIgnorable(request)');
			const delegation = body.indexOf('super.');
			expect(guard).toBeGreaterThanOrEqual(0);
			expect(delegation).toBeGreaterThan(guard);
			// The guard has to end the call, not merely precede it.
			expect(body.slice(guard, delegation)).toContain('return;');
		}
	);

	it('asks about the request rather than about the response', () => {
		// A status code cannot answer this. The 503 in #59 was indistinguishable
		// from a real outage; only `Sec-Purpose` on the request said the person
		// never asked for it.
		const source = shell('ShellWebViewClient.java');
		expect(methodBody(source, 'private static boolean isIgnorable')).toContain(
			'SpeculativeRequests.isSpeculative(request.getRequestHeaders())'
		);
	});

	it('still overrides a Capacitor that still does the thing being overridden', () => {
		// If a Capacitor upgrade stops navigating to the error page on a main-frame
		// failure, or moves the decision, this override is no longer the whole
		// story and someone has to look again. Read from the installed package so
		// the upgrade is what trips it.
		const base = readFileSync(
			new URL(
				'../../node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebViewClient.java',
				import.meta.url
			),
			'utf8'
		);
		for (const signature of ['public void onReceivedError', 'public void onReceivedHttpError']) {
			const body = methodBody(base, signature);
			expect(body).toContain('request.isForMainFrame()');
			expect(body).toContain('view.loadUrl(errorPath)');
		}
	});
});
