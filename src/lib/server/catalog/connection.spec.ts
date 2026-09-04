import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogDependencies, catalogPath, getCatalog, openCatalog } from './connection';

const directories: string[] = [];

function temporaryCatalog(): string {
	const directory = mkdtempSync(join(tmpdir(), 'fit-catalog-'));
	directories.push(directory);
	const path = join(directory, 'fit-food-core.sqlite');
	const db = new DatabaseSync(path);
	db.exec('create table food (food_id bigint, name varchar)');
	db.exec("insert into food values (1, 'MILK')");
	db.close();
	return path;
}

afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

describe('catalogPath', () => {
	it('takes the configured path', () => {
		expect(catalogPath('/var/lib/fit/catalog/fit-food-core.sqlite')).toBe(
			'/var/lib/fit/catalog/fit-food-core.sqlite'
		);
	});

	it('falls back to where the ETL writes on a developer machine', () => {
		expect(catalogPath(undefined)).toBe('data/db/fit-food-core.sqlite');
	});
});

describe('openCatalog', () => {
	it('answers null rather than throwing when the catalog is not installed', () => {
		expect(openCatalog('/var/lib/fit/catalog/absent.sqlite')).toBeNull();
	});

	it('does not try to open a path it has already found absent', () => {
		const open = vi.fn();
		openCatalog('/nowhere.sqlite', { exists: () => false, open });
		expect(open).not.toHaveBeenCalled();
	});

	it('opens the file read-only, so a rebuilt catalog can never hold user rows', () => {
		const db = openCatalog(temporaryCatalog());
		expect(db?.prepare('select name from food').get()?.['name']).toBe('MILK');
		expect(() => db?.exec("insert into food values (2, 'EGG')")).toThrow(/readonly/i);
		db?.close();
	});

	it('refuses a write at the connection as well as at the file handle', () => {
		const path = temporaryCatalog();
		// Opened writable on purpose: `query_only` is the second lock, and this
		// is the only way to see it work on its own.
		const db = openCatalog(path, {
			exists: catalogDependencies.exists,
			open: (location) => new DatabaseSync(location)
		});
		expect(() => db?.exec("insert into food values (2, 'EGG')")).toThrow();
		db?.close();
	});
});

describe('getCatalog', () => {
	it('opens the configured catalog once and hands the same connection back', () => {
		vi.stubEnv('FIT_CATALOG_PATH', temporaryCatalog());
		const first = getCatalog();
		expect(first?.prepare('select name from food').get()?.['name']).toBe('MILK');
		// Memoized as a wrapper, so an absent catalog is not retried per request
		// either; the same object proves the open did not run twice.
		expect(getCatalog()).toBe(first);
		vi.unstubAllEnvs();
	});
});
