import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

/** Fallback for a developer machine, where `data/db` is a symlink into the ETL's output. */
const DEFAULT_CATALOG_PATH = 'data/db/fit-food-core.sqlite';

/**
 * Where the built food catalog lives, resolved the way `applicationDatabasePath`
 * resolves `FIT_DB_PATH`: separately from opening it, so the default is testable
 * without touching a file.
 */
export function catalogPath(configured = process.env['FIT_CATALOG_PATH']): string {
	return configured ?? DEFAULT_CATALOG_PATH;
}

/** Injectable so the absent-file and read-only decisions are testable without a 365 MB file. */
export type CatalogDependencies = {
	exists: (path: string) => boolean;
	open: (path: string) => DatabaseSync;
};

export const catalogDependencies: CatalogDependencies = {
	exists: existsSync,
	open: (path) => new DatabaseSync(path, { readOnly: true })
};

/**
 * Open the food catalog read-only on its own connection.
 *
 * Never `getDatabase()`: that connection runs migrations and chmods its journals
 * to 0600, while this file is rebuilt wholesale by the ETL, shipped separately
 * and shared read-only. Mixing them would put user rows in a file the next ETL
 * run replaces — the warning `db.ts` already carries.
 *
 * `null`, not a throw, when the file is absent: the catalog is not in the
 * repository and not in CI, so the application has to start and serve every
 * other route without it.
 */
export function openCatalog(
	path: string,
	dependencies: CatalogDependencies = catalogDependencies
): DatabaseSync | null {
	if (!dependencies.exists(path)) return null;
	const db = dependencies.open(path);
	// Read-only at the connection as well as at the file handle, so a mistaken
	// statement fails where it is written rather than depending on file mode.
	db.exec('pragma query_only = true');
	return db;
}

/**
 * Memoized as a wrapper rather than as the connection itself: `null` is the
 * answer on a machine without the catalog, and `??=` on a bare `null` would
 * retry the open on every request.
 */
let resolved: { db: DatabaseSync | null } | undefined;

/** The process-wide catalog connection, or `null` where the file is not installed. */
export function getCatalog(): DatabaseSync | null {
	resolved ??= { db: openCatalog(catalogPath()) };
	return resolved.db;
}
