import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { catalogDependencies, openCatalog } from './connection';
import { prepared } from './statements';

const directories: string[] = [];

/** A one-row catalog on disk, so the reopen below is a real second handle. */
function temporaryCatalog(): string {
	const directory = mkdtempSync(join(tmpdir(), 'fit-statements-'));
	directories.push(directory);
	const path = join(directory, 'fit-food-core.sqlite');
	const db = new DatabaseSync(path);
	db.exec('create table food (food_id bigint, name varchar)');
	db.exec("insert into food values (1, 'MILK')");
	db.close();
	return path;
}

/** A connection that only counts, so the cache is asserted rather than inferred from timings. */
function counting(): { prepare: Mock<(sql: string) => StatementSync> } {
	return { prepare: vi.fn((sql: string) => ({ sql }) as unknown as StatementSync) };
}

afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

describe('prepared', () => {
	it('prepares a statement the first time it is asked for', () => {
		const db = counting();
		expect(prepared(db, 'select 1')).toBe(db.prepare.mock.results[0]?.value);
		expect(db.prepare).toHaveBeenCalledExactlyOnceWith('select 1');
	});

	it('answers the second call for the same SQL from the cache', () => {
		const db = counting();
		const first = prepared(db, 'select 1');
		expect(prepared(db, 'select 1')).toBe(first);
		expect(db.prepare).toHaveBeenCalledTimes(1);
	});

	it('keeps one statement per SQL shape rather than one per connection', () => {
		const db = counting();
		const first = prepared(db, 'select 1');
		const second = prepared(db, 'select 2');
		expect(second).not.toBe(first);
		expect(db.prepare).toHaveBeenCalledTimes(2);
		expect(prepared(db, 'select 1')).toBe(first);
		expect(db.prepare).toHaveBeenCalledTimes(2);
	});

	it('does not hand one connection the statements of another', () => {
		const first = counting();
		const second = counting();
		prepared(first, 'select 1');
		prepared(second, 'select 1');
		expect(second.prepare).toHaveBeenCalledTimes(1);
		expect(prepared(second, 'select 1')).not.toBe(prepared(first, 'select 1'));
	});

	it('starts empty when the catalog is reopened, so no statement outlives its handle', () => {
		// The whole reason the cache hangs off the handle: a `StatementSync` is
		// finalized with the connection that prepared it, and the ETL replaces
		// the catalog file underneath a running server.
		const path = temporaryCatalog();
		const prepares = vi.fn();
		const dependencies = {
			exists: catalogDependencies.exists,
			open: (location: string) => {
				const db = catalogDependencies.open(location);
				const real = db.prepare.bind(db);
				// Shadowed on the instance rather than proxied: `node:sqlite`
				// methods need their own receiver.
				db.prepare = (sql: string) => {
					prepares();
					return real(sql);
				};
				return db;
			}
		};

		const before = openCatalog(path, dependencies) as DatabaseSync;
		const held = prepared(before, 'select name from food');
		expect(prepared(before, 'select name from food')).toBe(held);
		expect(prepares).toHaveBeenCalledTimes(1);
		before.close();

		const after = openCatalog(path, dependencies) as DatabaseSync;
		const again = prepared(after, 'select name from food');
		// `Object.is` rather than `not.toBe`, which would try to serialize the
		// finalized statement to report the difference and throw doing it.
		expect(Object.is(again, held)).toBe(false);
		expect(prepares).toHaveBeenCalledTimes(2);
		// And it answers, which a statement carried over from the closed handle
		// could not.
		expect(again.get()?.['name']).toBe('MILK');
		after.close();
	});
});
