import type { DatabaseSync } from 'node:sqlite';
import { integer, text } from '../users/rows';

/** The stored document as read back: `body` is still the JSON text, not parsed. */
export type StateDocument = {
	version: number;
	format: string;
	body: string;
	updatedAt: string;
};

export type WriteResult =
	{ ok: true; version: number; updatedAt: string } | { ok: false; current: StateDocument | null };

/**
 * What a write changes, bundled rather than positional: `max-params` caps a
 * function at four, and a write already needs the database and household two
 * of those.
 */
export type DocumentWrite = {
	accountId: string;
	expectedVersion: number;
	format: string;
	body: string;
	now?: string;
};

/** No row yet reads the same as version 0: a household starts with nothing stored. */
export function readDocument(db: DatabaseSync, householdId: string): StateDocument | null {
	const row = db
		.prepare('select format, body, version, updated_at from household_state where household_id = ?')
		.get(householdId);
	if (!row) return null;
	return {
		version: integer(row, 'version'),
		format: text(row, 'format'),
		body: text(row, 'body'),
		updatedAt: text(row, 'updated_at')
	};
}

/**
 * Insert or update the household's document, but only from the version the
 * caller last read. `begin immediate` takes the write lock before the read, so
 * two writers racing on the same stale version cannot both see it as current.
 *
 * A mismatch is not an error: it means another writer won the race, and the
 * caller is handed what is actually stored so it can merge and retry.
 */
export function writeDocument(
	db: DatabaseSync,
	householdId: string,
	write: DocumentWrite
): WriteResult {
	const { accountId, expectedVersion, format, body, now = new Date().toISOString() } = write;
	db.exec('begin immediate');
	try {
		const current = readDocument(db, householdId);
		const storedVersion = current?.version ?? 0;
		if (storedVersion !== expectedVersion) {
			db.exec('rollback');
			return { ok: false, current };
		}
		const nextVersion = storedVersion + 1;
		if (current === null) {
			db.prepare(
				`insert into household_state (household_id, format, body, version, updated_at, updated_by)
				 values (?, ?, ?, ?, ?, ?)`
			).run(householdId, format, body, nextVersion, now, accountId);
		} else {
			db.prepare(
				`update household_state
				 set format = ?, body = ?, version = ?, updated_at = ?, updated_by = ?
				 where household_id = ? and version = ?`
			).run(format, body, nextVersion, now, accountId, householdId, storedVersion);
		}
		db.exec('commit');
		return { ok: true, version: nextVersion, updatedAt: now };
	} catch (error) {
		db.exec('rollback');
		throw error;
	}
}
