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

/**
 * Read an `integer not null` column off a result row.
 *
 * Same refusal to guess as `text`: a count that has become null or text is a
 * schema fault, and turning it into `NaN` would quietly disable whatever
 * threshold it was being compared against.
 */
export function integer(row: Record<string, SQLOutputValue>, column: string): number {
	const value = row[column];
	if (typeof value !== 'number') {
		throw new TypeError(`expected an integer in column "${column}"`);
	}
	return value;
}
