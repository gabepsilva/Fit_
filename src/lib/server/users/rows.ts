import type { SQLOutputValue } from 'node:sqlite';

/**
 * Read a `text not null` column. `node:sqlite` can return any `SQLOutputValue`,
 * so a column that has changed shape stops the request here rather than
 * becoming `"null"` downstream.
 */
export function text(row: Record<string, SQLOutputValue>, column: string): string {
	const value = row[column];
	if (typeof value !== 'string') {
		throw new TypeError(`expected text in column "${column}"`);
	}
	return value;
}

/**
 * Read an `integer not null` column. Same refusal to guess as `text`: a `NaN`
 * would quietly disable whatever threshold it was being compared against.
 */
export function integer(row: Record<string, SQLOutputValue>, column: string): number {
	const value = row[column];
	if (typeof value !== 'number') {
		throw new TypeError(`expected an integer in column "${column}"`);
	}
	return value;
}
