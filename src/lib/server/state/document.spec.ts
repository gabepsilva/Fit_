import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db';
import { registerAccount } from '../users/accounts';
import type { Account } from '../users/types';
import { readDocument, writeDocument } from './document';

/** See the note in `password.spec.ts`: the production cost is too slow to test at. */
const CHEAP = { n: 2 ** 12, r: 8, p: 1 };

const NOW = '2026-08-29T09:00:00.000Z';

let db: DatabaseSync;
let account: Account;
let householdId: string;

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
	householdId = db.prepare('select id from household').get()?.['id'] as string;
});

/**
 * Each case opens its own database; close it. Under a mutation run, hundreds of
 * live `node:sqlite` handles crash the worker, which Stryker records as a timeout.
 */
afterEach(() => {
	db.close();
});

describe('readDocument', () => {
	it('reports nothing stored for a household with no document', () => {
		expect(readDocument(db, householdId)).toBeNull();
	});

	it('reads back a stored document', () => {
		writeDocument(db, householdId, {
			accountId: account.id,
			expectedVersion: 0,
			format: 'tend.v1',
			body: '{"a":1}',
			now: NOW
		});
		expect(readDocument(db, householdId)).toEqual({
			version: 1,
			format: 'tend.v1',
			body: '{"a":1}',
			updatedAt: NOW
		});
	});
});

describe('writeDocument', () => {
	it('inserts the first version when nothing is stored and the caller expects 0', () => {
		const result = writeDocument(db, householdId, {
			accountId: account.id,
			expectedVersion: 0,
			format: 'tend.v1',
			body: '{"a":1}',
			now: NOW
		});
		expect(result).toEqual({ ok: true, version: 1, updatedAt: NOW });
	});

	it('advances the version on a write that matches what is stored', () => {
		writeDocument(db, householdId, {
			accountId: account.id,
			expectedVersion: 0,
			format: 'tend.v1',
			body: '{"a":1}',
			now: NOW
		});
		const later = '2026-08-29T10:00:00.000Z';
		const result = writeDocument(db, householdId, {
			accountId: account.id,
			expectedVersion: 1,
			format: 'tend.v1',
			body: '{"a":2}',
			now: later
		});
		expect(result).toEqual({ ok: true, version: 2, updatedAt: later });
		expect(readDocument(db, householdId)).toEqual({
			version: 2,
			format: 'tend.v1',
			body: '{"a":2}',
			updatedAt: later
		});
	});

	it('refuses a stale write and leaves the stored row unchanged', () => {
		writeDocument(db, householdId, {
			accountId: account.id,
			expectedVersion: 0,
			format: 'tend.v1',
			body: '{"a":1}',
			now: NOW
		});
		const later = '2026-08-29T10:00:00.000Z';
		const result = writeDocument(db, householdId, {
			accountId: account.id,
			expectedVersion: 0,
			format: 'tend.v1',
			body: '{"a":2}',
			now: later
		});
		expect(result).toEqual({
			ok: false,
			current: { version: 1, format: 'tend.v1', body: '{"a":1}', updatedAt: NOW }
		});
		expect(readDocument(db, householdId)).toEqual({
			version: 1,
			format: 'tend.v1',
			body: '{"a":1}',
			updatedAt: NOW
		});
	});

	it('refuses a first write that does not expect version 0', () => {
		const result = writeDocument(db, householdId, {
			accountId: account.id,
			expectedVersion: 1,
			format: 'tend.v1',
			body: '{"a":1}',
			now: NOW
		});
		expect(result).toEqual({ ok: false, current: null });
		expect(readDocument(db, householdId)).toBeNull();
	});

	it('runs the read, check and write inside one transaction', () => {
		writeDocument(db, householdId, {
			accountId: account.id,
			expectedVersion: 0,
			format: 'tend.v1',
			body: '{"a":1}',
			now: NOW
		});
		writeDocument(db, householdId, {
			accountId: account.id,
			expectedVersion: 1,
			format: 'tend.v1',
			body: '{"a":2}',
			now: '2026-08-29T10:00:00.000Z'
		});
		expect(db.prepare('select count(*) as n from household_state').get()?.['n']).toBe(1);
	});

	it('rolls back the write lock on a stale write, leaving the connection usable', () => {
		writeDocument(db, householdId, {
			accountId: account.id,
			expectedVersion: 0,
			format: 'tend.v1',
			body: '{"a":1}',
			now: NOW
		});
		// A stale write must release the write lock `begin immediate` took: if the
		// rollback here were skipped, the next `begin immediate` on this same
		// connection would fail with "cannot start a transaction within a
		// transaction" instead of succeeding.
		writeDocument(db, householdId, {
			accountId: account.id,
			expectedVersion: 0,
			format: 'tend.v1',
			body: '{"a":2}',
			now: NOW
		});
		const later = '2026-08-29T10:00:00.000Z';
		const result = writeDocument(db, householdId, {
			accountId: account.id,
			expectedVersion: 1,
			format: 'tend.v1',
			body: '{"a":3}',
			now: later
		});
		expect(result).toEqual({ ok: true, version: 2, updatedAt: later });
	});

	it('rolls back and rethrows when the write itself fails, leaving the connection usable', () => {
		// A household id with no matching `household` row violates the foreign
		// key `household_state` declares, which throws inside the transaction
		// after the version check already passed.
		expect(() =>
			writeDocument(db, 'no-such-household', {
				accountId: account.id,
				expectedVersion: 0,
				format: 'tend.v1',
				body: '{"a":1}',
				now: NOW
			})
		).toThrow();
		// If the catch block's rollback were skipped, this next write on the same
		// connection would fail with "cannot start a transaction within a
		// transaction" instead of succeeding.
		const result = writeDocument(db, householdId, {
			accountId: account.id,
			expectedVersion: 0,
			format: 'tend.v1',
			body: '{"a":1}',
			now: NOW
		});
		expect(result).toEqual({ ok: true, version: 1, updatedAt: NOW });
	});
});
