import { describe, expect, it } from 'vitest';
import { REVALIDATE, withCachePolicy } from './cache-policy';

/** What `adapter-node` hands back for a page: a body and a content type, and no policy at all. */
function shell(): Response {
	return new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } });
}

describe('withCachePolicy', () => {
	it('makes a response that declared nothing revalidate before it is reused', () => {
		expect(withCachePolicy(shell()).headers.get('cache-control')).toBe('no-cache');
	});

	it('returns the same response, so a hook can wrap the one it already has', () => {
		const response = shell();
		expect(withCachePolicy(response)).toBe(response);
	});

	it('leaves a policy the response already carries exactly as it is', () => {
		const asset = new Response('export{}', {
			headers: { 'cache-control': 'public, max-age=31536000, immutable' }
		});
		expect(withCachePolicy(asset).headers.get('cache-control')).toBe(
			'public, max-age=31536000, immutable'
		);
	});

	it('leaves a shorter policy alone too, rather than only the long ones', () => {
		const listing = new Response('{}', { headers: { 'cache-control': 'public, max-age=60' } });
		expect(withCachePolicy(listing).headers.get('cache-control')).toBe('public, max-age=60');
	});

	it('names the directive that permits storage and forbids reuse without asking', () => {
		// `no-store` would also be safe and would throw away a 304 the server can
		// still answer; `must-revalidate` alone only applies once stale, which is
		// the state a heuristic freshness lifetime never reaches.
		expect(REVALIDATE).toBe('no-cache');
	});
});
