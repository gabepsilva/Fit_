import { currentSession } from '$lib/auth/api';
import type { SessionAccount, SessionHousehold, SignedInSession } from '$lib/auth/api';

/** Where the browser keeps what the server last told it about its session. */
export const SESSION_STORAGE_KEY = 'fit.session.v1';

/**
 * What this device believes about its own session.
 *
 * A cache, and deliberately nothing more. The credential itself is an
 * `HttpOnly` cookie, which is the whole point of that flag: no script can read
 * it, so no script can tell you whether it is still good. What a browser
 * *can* hold is what the endpoint handed back when it signed in — the account,
 * its households, and the expiry — which is exactly why the response carries
 * `expiresAt` at all.
 *
 * So this decides what the drawer shows, and never what the server allows. The
 * authority is `locals.auth`, resolved once per request in `hooks.server.ts`,
 * and the sign-in page reconciles a stale record against it: if that page's
 * server `load` let it render, no session exists, whatever this store says.
 *
 * Nothing secret is written here. A `localStorage` payload an attacker could
 * read or forge names an account and grants nothing; presenting it to the
 * server gets a 401 like any other unauthenticated request.
 */
class SessionStore {
	current = $state<SignedInSession | null>(null);
	hydrated = $state(false);

	/** Who is signed in, or `null`. Reads the cache, so treat it as a display value. */
	get account(): SessionAccount | null {
		return this.current?.account ?? null;
	}

	/** The household the account owns or joined first, for naming it in the drawer. */
	get household(): SessionHousehold | null {
		return this.current?.households[0] ?? null;
	}

	/**
	 * Whether this device thinks it is signed in.
	 *
	 * The expiry is checked against the wall clock rather than only at load, so
	 * a tab left open past ninety days stops claiming a session it cannot have.
	 * That check is not itself reactive — it settles again whenever `current`
	 * changes, which is every sign-in and every sign-out.
	 */
	get signedIn(): boolean {
		const session = this.current;
		return session !== null && Date.parse(session.expiresAt) > Date.now();
	}

	/** Restore from `localStorage`. Safe to call more than once; a no-op after the first. */
	hydrate() {
		if (this.hydrated) return;
		this.current = this.read();
		this.hydrated = true;
		// An expired record is dropped rather than carried: it would show a name
		// in the drawer for a session the server forgot months ago.
		if (this.current !== null && !this.signedIn) this.forget();
	}

	/**
	 * Ask the server what this device's session actually is, and believe it.
	 *
	 * The record this store holds is what signing in answered, which can be
	 * months old: the session may have been revoked from another device, or its
	 * account signed out everywhere. `GET /api/sessions/current` is the only way
	 * a browser can find that out, because the credential is a cookie no script
	 * may read.
	 *
	 * Only a definitive answer signs this device out. A refused request means
	 * there is no session; a request that never arrived — offline, a WebView with
	 * no host — means nothing at all, and dropping the record for it would sign
	 * people out of a working session every time they went through a tunnel.
	 */
	async refresh(): Promise<boolean> {
		const result = await currentSession();
		if (result.ok) {
			this.begin(result.value);
			return true;
		}
		if (result.failure.code !== 'unreachable') this.forget();
		return false;
	}

	/** Record the session an endpoint just handed back. */
	begin(session: SignedInSession) {
		this.current = session;
		globalThis.localStorage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
	}

	/** Drop the record. Signing out calls this after the server has answered. */
	forget() {
		this.current = null;
		globalThis.localStorage?.removeItem(SESSION_STORAGE_KEY);
	}

	private read(): SignedInSession | null {
		const raw = globalThis.localStorage?.getItem(SESSION_STORAGE_KEY);
		if (!raw) return null;
		try {
			const parsed: unknown = JSON.parse(raw);
			return isSession(parsed) ? parsed : null;
		} catch {
			// A corrupt payload reads as signed out rather than crashing the shell.
			return null;
		}
	}
}

function isSession(value: unknown): value is SignedInSession {
	if (typeof value !== 'object' || value === null) return false;
	const session = value as Partial<SignedInSession>;
	return (
		typeof session.expiresAt === 'string' &&
		Array.isArray(session.households) &&
		typeof session.account?.displayName === 'string' &&
		typeof session.account.username === 'string'
	);
}

export const session = new SessionStore();
