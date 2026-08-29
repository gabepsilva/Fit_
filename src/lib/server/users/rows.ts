import type { SQLOutputValue } from 'node:sqlite';

/**
 * Read a `text not null` column off a result row.
 *
 * `node:sqlite` hands back `SQLOutputValue`, which is every type SQLite can
 * hold. Refusing to guess is the point: a column that has quietly changed shape
 * should stop the request rather than become the string `"null"` three layers
 * further on, inside somebody's session record.
 */
export function text(row: Record<string, SQLOutputValue>, column: string): string {
	const value = row[column];
	if (typeof value !== 'string') {
		throw new TypeError(`expected text in column "${column}"`);
	}
	return value;
}
