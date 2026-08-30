import { DatabaseSync } from 'node:sqlite';
import { E2E_DATABASE_PATH } from '../playwright.config';

/**
 * Shared setup for the flows that create accounts.
 *
 * `REGISTRATION_POLICY` allows ten registration attempts an hour from one
 * address, and this suite makes exactly ten — five accounts and five deliberate
 * refusals, which count the same. That left the last seed of a clean run being
 * answered 429, so the suite failed on its own throttle rather than on the
 * application, and adding an eleventh test would have failed a different one.
 *
 * Clearing the registration scope between tests is safe here in a way it would
 * not be in the application: the file is this run's own database, the throttle
 * itself is covered by `throttle.spec.ts` and by the security mutation lane,
 * and nothing end-to-end asserts registration throttling. The per-username and
 * per-address scopes are deliberately left alone, so a test that fails a
 * sign-in on purpose still behaves the way a real one would.
 */
export function clearRegistrationThrottle(): void {
	const database = new DatabaseSync(E2E_DATABASE_PATH);
	try {
		// The preview server holds the same file, and workers run in parallel, so a
		// write can meet one in progress. Waiting is the whole remedy: these writes
		// are a single small delete, and the alternative is a flake that looks like
		// an application failure.
		database.exec('pragma busy_timeout = 5000');
		// The server builds its schema on the first request that needs it, so the
		// tests that never sign in reach here before the table exists. Nothing has
		// been counted yet in that case, which is the state this is asking for.
		const created = database
			.prepare("select 1 from sqlite_master where type = 'table' and name = ?")
			.get('sign_in_throttle');
		if (created !== undefined)
			database.exec("delete from sign_in_throttle where scope = 'registration'");
	} finally {
		database.close();
	}
}
