import { currentSession } from '$lib/auth/api';
import type { SessionAccount, SessionHousehold, SignedInSession } from '$lib/auth/api';

export const SESSION_STORAGE_KEY = 'fit.session.v1';

// A display cache only: the credential is an `HttpOnly` cookie, authority is `locals.auth`.
// Nothing secret is stored; a forged payload gets a 401 like any unauthenticated request.
export class SessionStore {
	current = $state<SignedInSession | null>(null);
	hydrated = $state(false);

	get account(): SessionAccount | null {
		return this.current?.account ?? null;
	}

	get household(): SessionHousehold | null {
		return this.current?.households[0] ?? null;
	}

	// Checked against the wall clock so a tab left open past expiry stops claiming a session.
	get signedIn(): boolean {
		const session = this.current;
		return session !== null && Date.parse(session.expiresAt) > Date.now();
	}

	hydrate() {
		if (this.hydrated) return;
		this.current = this.read();
		this.hydrated = true;
		// An expired record would show a name in the drawer for a dead session.
		if (this.current !== null && !this.signedIn) this.forget();
	}

	// Only a definitive "no session" signs out; a network error means nothing and the record is kept.
	async refresh(): Promise<boolean> {
		// What the answer is about, remembered before it is asked for. A refusal
		// is only news about the session that was current when the question went
		// out, and the sign-in form is a place where that can stop being true
		// mid-flight: it asks this on mount, and the visitor may sign in before
		// the answer lands. Signing the freshly signed-in device straight back
		// out is what that used to do, and the gate then returned it to the form
		// it had just cleared.
		const asked = this.current;
		const result = await currentSession();
		if (result.ok) {
			this.begin(result.value);
			return true;
		}
		if (result.failure.code !== 'unreachable' && this.current === asked) this.forget();
		return false;
	}

	begin(session: SignedInSession) {
		this.current = session;
		globalThis.localStorage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
	}

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
			return null;
		}
	}
}

// Exported so tests can exercise the rejection rules directly; the payload is attacker-controllable.
export function isSession(value: unknown): value is SignedInSession {
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
