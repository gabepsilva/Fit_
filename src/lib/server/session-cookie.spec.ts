import { describe, expect, it } from 'vitest';
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from './session-cookie';
import type { SessionCookieWriter } from './session-cookie';

const NOW = new Date('2026-08-29T09:00:00.000Z');
const EXPIRES_AT = '2026-11-27T09:00:00.000Z';
const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;
const TOKEN = 't'.repeat(43);

const issued = { token: TOKEN, expiresAt: EXPIRES_AT };

/** A stand-in for SvelteKit's `Cookies`, flattening each call into one record. */
function recorder() {
	const written: Record<string, unknown>[] = [];
	const removed: Record<string, unknown>[] = [];
	const cookies: SessionCookieWriter = {
		set(name, value, options) {
			written.push({ name, value, ...options });
		},
		delete(name, options) {
			removed.push({ name, ...options });
		}
	};
	return { cookies, written, removed };
}

function setOn(url: string, now = NOW): Record<string, unknown> {
	const { cookies, written } = recorder();
	setSessionCookie(cookies, new URL(url), issued, now);
	return written[0] ?? {};
}

function clearOn(url: string): Record<string, unknown> {
	const { cookies, removed } = recorder();
	clearSessionCookie(cookies, new URL(url));
	return removed[0] ?? {};
}

describe('setSessionCookie', () => {
	it('writes the token under the name the request hook reads', () => {
		expect(setOn('https://fit.example/sign-in')).toMatchObject({
			name: SESSION_COOKIE,
			value: TOKEN
		});
	});

	it('keeps the token away from script', () => {
		expect(setOn('https://fit.example/sign-in')).toMatchObject({ httpOnly: true });
	});

	it('withholds the cookie from cross-site form posts', () => {
		expect(setOn('https://fit.example/sign-in')).toMatchObject({ sameSite: 'lax' });
	});

	it('scopes the cookie to the whole site, so every route sees one session', () => {
		expect(setOn('https://fit.example/sign-in')).toMatchObject({ path: '/' });
	});

	it('marks the cookie secure over HTTPS', () => {
		expect(setOn('https://fit.example/sign-in')).toMatchObject({ secure: true });
	});

	it.each([
		'http://localhost:5173/sign-in',
		'http://127.0.0.1:5173/sign-in',
		'http://[::1]:5173/sign-in'
	])('drops Secure only for loopback HTTP, which dev cannot serve over TLS: %s', (url) => {
		expect(setOn(url)).toMatchObject({ secure: false });
	});

	it('still marks the cookie secure on loopback HTTPS', () => {
		expect(setOn('https://localhost:5173/sign-in')).toMatchObject({ secure: true });
	});

	it('marks the cookie secure on a plain-HTTP host that is not loopback', () => {
		// A plain-HTTP deployment must fail visibly at sign-in, not send tokens in clear.
		expect(setOn('http://fit.example/sign-in')).toMatchObject({ secure: true });
	});

	it('expires the cookie with the session row behind it', () => {
		expect(setOn('https://fit.example/sign-in')).toMatchObject({ maxAge: NINETY_DAYS_SECONDS });
	});

	it('shortens the cookie as the session ages rather than starting the clock again', () => {
		const oneDayIn = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
		expect(setOn('https://fit.example/sign-in', oneDayIn)).toMatchObject({
			maxAge: 89 * 24 * 60 * 60
		});
	});

	it('never writes a cookie that outlives an already-expired session', () => {
		const afterExpiry = new Date('2026-11-28T09:00:00.000Z');
		expect(setOn('https://fit.example/sign-in', afterExpiry)).toMatchObject({ maxAge: 0 });
	});

	it('dates the cookie from the real clock when none is given', () => {
		const { cookies, written } = recorder();
		setSessionCookie(cookies, new URL('https://fit.example/sign-in'), {
			token: TOKEN,
			expiresAt: new Date(Date.now() + 60_000).toISOString()
		});
		// Rounded down: a cookie is never allowed to outlive its row.
		const maxAge = Number(written[0]?.['maxAge']);
		expect(maxAge).toBeGreaterThan(50);
		expect(maxAge).toBeLessThanOrEqual(60);
	});
});

describe('clearSessionCookie', () => {
	it('removes the cookie by the name it was written under', () => {
		expect(clearOn('https://fit.example/sign-out')).toMatchObject({ name: SESSION_COOKIE });
	});

	it('removes it with the attributes it was set with, or the browser keeps it', () => {
		const { path, httpOnly, secure, sameSite } = setOn('https://fit.example/sign-in');
		expect(clearOn('https://fit.example/sign-out')).toMatchObject({
			path,
			httpOnly,
			secure,
			sameSite
		});
	});

	it('expires the cookie immediately', () => {
		expect(clearOn('https://fit.example/sign-out')).toMatchObject({ maxAge: 0 });
	});

	it('drops Secure on loopback HTTP too, so a dev sign-out actually removes it', () => {
		expect(clearOn('http://localhost:5173/sign-out')).toMatchObject({ secure: false });
	});
});
