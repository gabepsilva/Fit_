import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../db';
import { registerAccount } from './accounts';
import {
	createSession,
	endAllSessions,
	endSession,
	LAST_SEEN_UPDATE_INTERVAL_MS,
	resolveSession
} from './sessions';
import type { Account } from './types';

/** See the note in `password.spec.ts`: the production cost is too slow to test at. */
const CHEAP = { n: 2 ** 12, r: 8, p: 1 };

const NOW = new Date('2026-08-29T09:00:00.000Z');

let db: DatabaseSync;
let account: Account;

beforeEach(async () => {
	db = openDatabase(':memory:');
	const result = await registerAccount(
		db,
		{
			username: 'jordan',
			displayName: 'Jordan',
			password: 'correct horse battery',
			householdName: 'Flat 3'
		},
		CHEAP
	);
	if (!result.ok) throw new Error(`registration failed: ${JSON.stringify(result.problem)}`);
	account = result.account;
});

/**
 * Each case opens its own database; close it. Under a mutation run, hundreds of
 * live `node:sqlite` handles crash the worker, which Stryker records as a timeout.
 */
afterEach(() => {
	db.close();
});

function storedFor(token: string) {
	const hash = createHash('sha256').update(token).digest('hex');
	return db.prepare('select * from session where token_hash = ?').get(hash);
}

describe('createSession', () => {
	it('stores only the hash of the token it hands back', () => {
		const { token } = createSession(db, account.id, null, NOW);
		const anyRow = db.prepare('select token_hash from session').get();
		expect(anyRow?.['token_hash']).not.toBe(token);
	});

	it('finds the row again by hashing the token', () => {
		const { token, session } = createSession(db, account.id, null, NOW);
		expect(storedFor(token)?.['id']).toBe(session.id);
	});

	it('expires ninety days out', () => {
		const { session } = createSession(db, account.id, null, NOW);
		expect(session.expiresAt).toBe('2026-11-27T09:00:00.000Z');
	});

	it('records the device, so a lost phone can be told apart from a laptop', () => {
		const { token } = createSession(db, account.id, 'Pixel 8', NOW);
		expect(storedFor(token)?.['device_label']).toBe('Pixel 8');
	});

	it('mints a different token every time', () => {
		const first = createSession(db, account.id, null, NOW).token;
		expect(createSession(db, account.id, null, NOW).token).not.toBe(first);
	});

	it('rejects an oversized device label before issuing a session', () => {
		expect(() => createSession(db, account.id, 'x'.repeat(101), NOW)).toThrow(
			expect.objectContaining({
				problem: { field: 'deviceLabel', code: 'too-long' }
			})
		);
		expect(db.prepare('select count(*) as n from session').get()?.['n']).toBe(0);
	});

	it('rejects a device label containing unsafe directional controls', () => {
		expect(() => createSession(db, account.id, 'Pixel\u202E8', NOW)).toThrow(
			expect.objectContaining({
				problem: { field: 'deviceLabel', code: 'unsafe-characters' }
			})
		);
		expect(db.prepare('select count(*) as n from session').get()?.['n']).toBe(0);
	});
});

describe('resolveSession', () => {
	it('uses a five-minute last-seen write interval', () => {
		expect(LAST_SEEN_UPDATE_INTERVAL_MS).toBe(300_000);
	});

	it('returns the account behind the token', () => {
		const { token, session } = createSession(db, account.id, null, NOW);
		expect(resolveSession(db, token, NOW)).toMatchObject({ account, session });
	});

	it('resolves the households the request may read, not just who is asking', () => {
		const { token } = createSession(db, account.id, null, NOW);
		expect(resolveSession(db, token, NOW)?.households).toMatchObject([
			{ name: 'Flat 3', role: 'owner' }
		]);
	});

	it('returns null for a token nobody was issued', () => {
		createSession(db, account.id, null, NOW);
		expect(resolveSession(db, 'not-a-real-token', NOW)).toBeNull();
	});

	it('returns null once the session has expired', () => {
		const { token, session } = createSession(db, account.id, null, NOW);
		expect(resolveSession(db, token, new Date(session.expiresAt))).toBeNull();
	});

	it('deletes the expired row rather than leaving it to be swept later', () => {
		const { token, session } = createSession(db, account.id, null, NOW);
		resolveSession(db, token, new Date(session.expiresAt));
		expect(storedFor(token)).toBeUndefined();
	});

	it('still resolves a moment before expiry', () => {
		const { token, session } = createSession(db, account.id, null, NOW);
		const justBefore = new Date(new Date(session.expiresAt).getTime() - 1);
		expect(resolveSession(db, token, justBefore)).not.toBeNull();
	});

	it('records that the session was used', () => {
		const { token } = createSession(db, account.id, null, NOW);
		const later = new Date('2026-09-01T09:00:00.000Z');
		resolveSession(db, token, later);
		expect(storedFor(token)?.['last_seen_at']).toBe(later.toISOString());
	});

	it('throttles last-seen writes and refreshes exactly at the interval boundary', () => {
		const { token } = createSession(db, account.id, null, NOW);
		const prepare = vi.spyOn(db, 'prepare');
		const beforeBoundary = new Date(NOW.getTime() + LAST_SEEN_UPDATE_INTERVAL_MS - 1);
		resolveSession(db, token, beforeBoundary);
		expect(storedFor(token)?.['last_seen_at']).toBe(NOW.toISOString());
		expect(prepare.mock.calls.some(([sql]) => String(sql).startsWith('update session'))).toBe(
			false
		);

		const boundary = new Date(NOW.getTime() + LAST_SEEN_UPDATE_INTERVAL_MS);
		resolveSession(db, token, boundary);
		expect(storedFor(token)?.['last_seen_at']).toBe(boundary.toISOString());
		expect(prepare.mock.calls.some(([sql]) => String(sql).startsWith('update session'))).toBe(true);
	});
});

describe('endSession', () => {
	it('reports that it ended a live session', () => {
		const { token } = createSession(db, account.id, null, NOW);
		expect(endSession(db, token)).toBe(true);
	});

	it('stops the token resolving', () => {
		const { token } = createSession(db, account.id, null, NOW);
		endSession(db, token);
		expect(resolveSession(db, token, NOW)).toBeNull();
	});

	it('reports that there was nothing to end', () => {
		expect(endSession(db, 'not-a-real-token')).toBe(false);
	});

	it('leaves the other sessions on the account alone', () => {
		const kept = createSession(db, account.id, 'Laptop', NOW).token;
		endSession(db, createSession(db, account.id, 'Pixel 8', NOW).token);
		expect(resolveSession(db, kept, NOW)).not.toBeNull();
	});
});

describe('without an explicit device or clock', () => {
	it('leaves the device unlabelled', () => {
		const { token } = createSession(db, account.id);
		expect(storedFor(token)?.['device_label']).toBeNull();
	});

	it('dates the session from the real clock', () => {
		const before = Date.now();
		const { session } = createSession(db, account.id);
		const ninetyDays = 90 * 24 * 60 * 60 * 1000;
		expect(new Date(session.expiresAt).getTime()).toBeGreaterThanOrEqual(before + ninetyDays);
	});

	it('resolves against the real clock', () => {
		const { token } = createSession(db, account.id);
		expect(resolveSession(db, token)?.account.id).toBe(account.id);
	});
});

describe('endAllSessions', () => {
	it('ends every session the account has', () => {
		createSession(db, account.id, 'Laptop', NOW);
		createSession(db, account.id, 'Pixel 8', NOW);
		expect(endAllSessions(db, account.id)).toBe(2);
	});

	it('counts nothing for an account with no sessions', () => {
		expect(endAllSessions(db, account.id)).toBe(0);
	});
});
