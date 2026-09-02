import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect, type Page } from '@playwright/test';
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
	// `data/runtime` is gitignored, so a fresh checkout does not have it, and the
	// directory is created by `prepareDatabaseFile` inside the server — lazily, on
	// the first request that actually needs the database. A test that clears the
	// throttle before any such request would otherwise open a path whose directory
	// does not exist yet and fail with "unable to open database file", which is how
	// this read as five failing sign-in tests in CI and none locally, where
	// `data/runtime` survives from earlier runs.
	//
	// Returning is the honest answer rather than creating the file here: no
	// database means nothing has been counted, which is the state this is asking
	// for, and the server owns that file's creation and its permissions.
	if (!existsSync(E2E_DATABASE_PATH)) return;
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

/**
 * Where the browser keeps what the server last told it about its session.
 *
 * Spelled out rather than imported from `state/session.svelte.ts`: that module
 * is compiled Svelte and this file runs in plain Node under the Playwright
 * runner. A spec beside that module asserts the same string, so a rename cannot
 * pass silently.
 */
const SESSION_STORAGE_KEY = 'fit.session.v1';

const PASSWORD = 'salt-and-pepper-mill';

/**
 * A name no other run has used.
 *
 * The database behind the preview server is a file that survives the suite, so
 * a fixed name would pass once and then meet its own leftover row; a random one
 * would make the failure intermittent instead of impossible. A UUID is neither
 * — it is unique by construction, and its hex and hyphens are inside the
 * `. _ -` the server accepts.
 *
 * The sign-in throttle also counts failures per username, so a name of its own
 * keeps a test that fails a sign-in on purpose from locking out the next one.
 */
export function freshUsername(): string {
	return `e2e-${randomUUID().slice(0, 13)}`;
}

/**
 * Get past the gate, so a suite about something else can start where it means to.
 *
 * Registration goes through the endpoint rather than the form, for the reason a
 * seeded account always does: a second flow inside the setup would make every
 * failure below ambiguous. `page.request` shares the context's cookie jar, so
 * the session cookie the endpoint sets is the one the page then sends.
 *
 * The record in `localStorage` is the other half. The credential is `HttpOnly`,
 * so the shell cannot read it and decides what to draw from that record alone —
 * without it the page would be gated while holding a perfectly good session.
 * `addInitScript` writes it before any document script runs, which is what keeps
 * the sign-in form from appearing for a frame first.
 *
 * The `origin` header is the one thing an API context has to say for itself:
 * `hooks.server.ts` refuses an unsafe request that does not declare where it
 * came from, because a browser always declares it.
 */
export async function signInThroughApi(
	page: Page,
	baseURL: string,
	username = freshUsername()
): Promise<string> {
	const response = await page.request.post('/api/accounts', {
		headers: { origin: new URL(baseURL).origin },
		data: { username, displayName: 'Robin', password: PASSWORD, householdName: 'Kitchen' }
	});
	expect(response.status()).toBe(201);
	const record = JSON.stringify(await response.json());
	// Seeded once for the context, not on every document.
	//
	// `addInitScript` runs before the scripts of *each* page load, so writing the
	// record unconditionally would put it back after any reload — including one
	// that follows a sign-out through the drawer, which resurrects the session
	// the test had just ended and fails it somewhere that looks unrelated. The
	// flag in `sessionStorage` survives reloads within the tab and nothing else,
	// so the seed happens on the first document and never again.
	await page.addInitScript(
		([key, value, flag]) => {
			if (globalThis.sessionStorage.getItem(flag ?? '') !== null) return;
			globalThis.sessionStorage.setItem(flag ?? '', '1');
			globalThis.localStorage.setItem(key ?? '', value ?? '');
		},
		[SESSION_STORAGE_KEY, record, 'fit.e2e.seeded']
	);
	return username;
}
