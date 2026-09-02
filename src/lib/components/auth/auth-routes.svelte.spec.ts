import { describe, expect, it } from 'vitest';
import { AUTH_ROUTES, returnPath, signInPath } from './auth-routes';

describe('AUTH_ROUTES', () => {
	it('lets an unauthenticated visitor reach the form', () => {
		expect(AUTH_ROUTES).toContain('/signin');
	});

	it('lets them reach the one that creates an account', () => {
		expect(AUTH_ROUTES).toContain('/signup');
	});

	it('opens nothing else', () => {
		expect(AUTH_ROUTES).toHaveLength(2);
	});
});

describe('signInPath', () => {
	it('is the bare form when the front page is what was asked for', () => {
		// The home page is the default on the other side, so saying it would be
		// noise in the address bar for the commonest case there is.
		expect(signInPath('/')).toBe('/signin');
	});

	it('names the destination that was turned away', () => {
		expect(signInPath('/progress')).toBe(`/signin?next=${encodeURIComponent('/progress')}`);
	});

	it('encodes the path, so its slashes stay inside the parameter', () => {
		// Unencoded, `/exercise/session` would end the parameter at the first
		// slash and the page would come back to somewhere else entirely.
		expect(signInPath('/exercise/session')).toBe(
			`/signin?next=${encodeURIComponent('/exercise/session')}`
		);
	});

	it('encodes a query too, so it cannot become a second parameter', () => {
		expect(signInPath('/exercise/plan?week=3')).toBe(
			`/signin?next=${encodeURIComponent('/exercise/plan?week=3')}`
		);
	});

	it('survives a round trip through the rule that reads it back', () => {
		const path = '/exercise/routines/r-1?edit=1';
		const next = new URL(signInPath(path), 'http://localhost').searchParams.get('next');
		expect(returnPath(next)).toBe(path);
	});
});

describe('returnPath', () => {
	it('goes to the front page when the gate sent nobody', () => {
		expect(returnPath(null)).toBe('/');
	});

	it('returns to the page that was gated', () => {
		expect(returnPath('/exercise')).toBe('/exercise');
	});

	it('keeps the query the gated page carried', () => {
		expect(returnPath('/plan?week=3')).toBe('/plan?week=3');
	});

	it('refuses another origin written as a protocol-relative path', () => {
		// `//evil.example` is absolute, and following it would make the sign-in
		// page an open redirect for anybody who could hand someone a link.
		expect(returnPath('//evil.example/steal')).toBe('/');
	});

	it('refuses an absolute URL', () => {
		expect(returnPath('https://evil.example/steal')).toBe('/');
	});

	it('refuses the backslash spelling of another origin', () => {
		// `/\host` is not a path. The URL parser treats the backslash as a slash
		// for http and https, so this resolves to http://evil.example exactly as
		// `//evil.example` does — which the assertion below states outright,
		// because the whole point of the rule is what the browser will do with it.
		expect(new URL('/\\evil.example/steal', 'http://app.local').origin).toBe('http://evil.example');
		expect(returnPath('/\\evil.example/steal')).toBe('/');
	});

	it('refuses a path that is not one', () => {
		expect(returnPath('exercise')).toBe('/');
	});

	it('minds only how the value starts, not what its query carries', () => {
		// The rule is about the first two characters. Applied anywhere in the
		// string it would reject this, and a destination whose query holds a URL
		// is an ordinary thing to be sent back to.
		const path = '/foods?source=https://example.com/list';
		expect(returnPath(path)).toBe(path);
	});

	it('refuses to bounce back to the form just cleared', () => {
		expect(returnPath('/signin')).toBe('/');
	});

	it('refuses the sign-up form too, query and all', () => {
		expect(returnPath('/signup?next=%2F')).toBe('/');
	});

	it('refuses the sign-in form wearing a fragment', () => {
		// The worse half of the same rule: arriving at `/signin#x` is a navigation
		// within the route already on screen, so the page is not remounted and the
		// check that moves a signed-in visitor on never runs a second time.
		expect(returnPath('/signin#x')).toBe('/');
	});

	it('keeps a fragment on a page that is not the form', () => {
		expect(returnPath('/exercise/session#set-3')).toBe('/exercise/session#set-3');
	});
});
