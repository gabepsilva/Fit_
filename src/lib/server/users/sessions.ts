import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { membershipsFor } from './accounts';
import { newId } from './ids';
import { text } from './rows';
import type { Auth, Session } from './types';

const TOKEN_BYTES = 32;
const LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Sessions are rows, not signed tokens.
 *
 * A JWT cannot be withdrawn before it expires, and this application is used on
 * a phone that gets lost — "sign out my other devices" has to mean something.
 * A row also survives the thing a refresh-token scheme cannot: a workout logged
 * in a basement gym with no signal, where nothing can be refreshed and the
 * client still has to work.
 */
function hashToken(token: string): string {
	// SHA-256, not scrypt. The token is 256 bits straight from the CSPRNG, so
	// there is no low-entropy secret to slow an attacker down over; spending
	// 350 ms on every authenticated request would buy exactly nothing.
	return createHash('sha256').update(token).digest('hex');
}

/**
 * Start a session and return the token once. Only its hash is stored, so a
 * database that leaks does not hand over live sessions with it.
 */
export function createSession(
	db: DatabaseSync,
	accountId: string,
	deviceLabel: string | null = null,
	now = new Date()
): { token: string; session: Session } {
	const token = randomBytes(TOKEN_BYTES).toString('base64url');
	const stamp = now.toISOString();
	const session: Session = {
		id: newId(now.getTime()),
		accountId,
		expiresAt: new Date(now.getTime() + LIFETIME_MS).toISOString()
	};
	db.prepare(
		`insert into session (id, account_id, token_hash, device_label, created_at, last_seen_at, expires_at)
		 values (?, ?, ?, ?, ?, ?, ?)`
	).run(session.id, accountId, hashToken(token), deviceLabel, stamp, stamp, session.expiresAt);
	return { token, session };
}

/** Who is making this request, or `null` for no token, an unknown one, or an expired one. */
export function resolveSession(db: DatabaseSync, token: string, now = new Date()): Auth | null {
	const tokenHash = hashToken(token);
	const row = db
		.prepare(
			`select s.id as session_id, s.expires_at, a.id as account_id, a.username,
			        a.display_name, a.created_at
			 from session s
			 join account a on a.id = s.account_id
			 where s.token_hash = ?`
		)
		.get(tokenHash);
	if (!row) return null;
	const expiresAt = text(row, 'expires_at');
	const stamp = now.toISOString();
	// Both sides are UTC ISO-8601 of the same width, where lexical order is
	// chronological order — so this is a string comparison on purpose.
	if (expiresAt <= stamp) {
		// Deleted on sight rather than swept on a timer: the row is worthless and
		// this is the one moment we are certainly holding it.
		db.prepare('delete from session where token_hash = ?').run(tokenHash);
		return null;
	}
	db.prepare('update session set last_seen_at = ? where token_hash = ?').run(stamp, tokenHash);
	const accountId = text(row, 'account_id');
	return {
		account: {
			id: accountId,
			username: text(row, 'username'),
			displayName: text(row, 'display_name'),
			createdAt: text(row, 'created_at')
		},
		session: { id: text(row, 'session_id'), accountId, expiresAt },
		households: membershipsFor(db, accountId)
	};
}

/** End one session. Returns whether there was one to end. */
export function endSession(db: DatabaseSync, token: string): boolean {
	const result = db.prepare('delete from session where token_hash = ?').run(hashToken(token));
	return Number(result.changes) > 0;
}

/** End every session for an account — the "sign out my other devices" of a lost phone. */
export function endAllSessions(db: DatabaseSync, accountId: string): number {
	const result = db.prepare('delete from session where account_id = ?').run(accountId);
	return Number(result.changes);
}
