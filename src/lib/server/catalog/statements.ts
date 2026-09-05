import type { DatabaseSync, StatementSync } from 'node:sqlite';

/**
 * Prepared statements, kept for as long as the connection that owns them.
 *
 * `db.prepare` is not free: on the live catalog, preparing the ranked search
 * costs 1.16 ms, which the search endpoint was paying on every keystroke — more
 * than the whole portions read beside it. The SQL text is built from constants
 * and a page size, so there are a handful of distinct shapes per connection and
 * the same one comes back on nearly every request.
 *
 * Keyed on the connection and not merely on the SQL, because a `StatementSync`
 * belongs to the handle it was prepared on and dies with it. A cache keyed on
 * the text alone would hand a finalized statement to whoever opened the catalog
 * next — which the specs do between every test, and which the server does when
 * the catalog is reopened after the ETL replaces the file. A `WeakMap` makes
 * that structural rather than a rule to remember: a reopened catalog is a new
 * handle and therefore an empty cache, and the old handle's statements become
 * collectable with it. There is nothing to invalidate and nothing to close.
 */
const byConnection = new WeakMap<Preparing, Map<string, StatementSync>>();

/** The one method this needs, so a spec can count `prepare` calls without a database. */
type Preparing = Pick<DatabaseSync, 'prepare'>;

/** `db.prepare(sql)`, answered from this connection's cache after the first call. */
export function prepared(db: Preparing, sql: string): StatementSync {
	let statements = byConnection.get(db);
	if (statements === undefined) {
		statements = new Map();
		byConnection.set(db, statements);
	}
	const held = statements.get(sql);
	if (held !== undefined) return held;
	const statement = db.prepare(sql);
	statements.set(sql, statement);
	return statement;
}
