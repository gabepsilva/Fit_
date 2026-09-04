import { expect } from '@playwright/test';
import { test } from '../../tests/preview-server';

/**
 * That a deploy actually reaches a browser which already has the app open.
 *
 * On 2026-09-04 it did not. `ssr = false` makes the served document nothing but
 * a bootstrap for one hashed bundle, and it went out with no `Cache-Control`,
 * no `ETag` and no `Last-Modified` — no freshness information at all, which is
 * an invitation for a cache to invent some. Android's WebView invented a
 * generous one and spent a day booting a build from that morning, requesting
 * chunks every deploy since had removed. Every feature shipped that day missed
 * the one phone it was shipped for.
 *
 * These run against the built application over HTTP rather than against the
 * hook, because the defect was in what left the server: the hook was never
 * asked about the shell's headers, so a unit test alone would have agreed with
 * itself while production stayed broken.
 */

/** What the shell's bootstrap imports, resolved against the page it was served for. */
function bootstrapChunk(html: string, page: string): string {
	const match = /import\("(\.?\/?_app\/immutable\/entry\/start\.[^"]+)"\)/.exec(html);
	expect(match, 'the shell should boot a hashed entry chunk').not.toBeNull();
	return new URL(match?.[1] ?? '', `http://localhost${page}`).pathname;
}

test.describe('cache policy', () => {
	for (const path of ['/', '/signin', '/you']) {
		test(`the shell at ${path} is never reused without asking the server`, async ({ request }) => {
			const response = await request.get(path);
			expect(response.status()).toBe(200);
			expect(response.headers()['cache-control']).toBe('no-cache');
		});
	}

	test('the hashed bundle keeps its year, so revalidating the shell stays cheap', async ({
		request
	}) => {
		const shell = await request.get('/');
		const chunk = bootstrapChunk(await shell.text(), '/');
		const asset = await request.get(chunk);
		expect(asset.status()).toBe(200);
		expect(asset.headers()['cache-control']).toContain('max-age=31536000');
		expect(asset.headers()['cache-control']).toContain('immutable');
	});

	test('a chunk an older build named keeps the refusal SvelteKit wrote for it', async ({
		request
	}) => {
		// The stale phone asked for `nodes/2.p9DiD9SB.js` all day and got this 404.
		// SvelteKit sets the header itself, expressly so an adapter cannot cache a
		// missing asset, and this policy leaves anything already declared alone —
		// including that. Asserted so the rule cannot quietly become "overwrite
		// everything", which would take a route's own `setHeaders` with it.
		//
		// It is also where Cloudflare, not this server, is the remaining problem:
		// with the zone's Browser Cache TTL at four hours the edge rewrites this
		// `max-age=0` to `max-age=14400`, so a stuck client is told to stay sure
		// the chunk is gone. That is a zone setting, and it is Gabriel's to change.
		const gone = await request.get('/_app/immutable/nodes/2.p9DiD9SB.js');
		expect(gone.status()).toBe(404);
		expect(gone.headers()['cache-control']).toBe('public, max-age=0, must-revalidate');
	});

	test('an API answer is not reusable either, so state cannot come back stale', async ({
		request
	}) => {
		const response = await request.get('/api/sessions/current');
		expect(response.status()).toBe(401);
		expect(response.headers()['cache-control']).toBe('no-cache');
	});

	test('the version endpoint answers anyone, and never from a cache', async ({ request }) => {
		// The deploy's smoke check reads this before it has an account, and a
		// cached answer would report the release it replaced as the live one.
		const response = await request.get('/api/version');
		expect(response.status()).toBe(200);
		expect(response.headers()['cache-control']).toBe('no-cache');
		expect(((await response.json()) as { version: string }).version).toMatch(/^v\d+\.\d+\.\d+/);
	});
});
