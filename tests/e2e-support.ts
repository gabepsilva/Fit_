import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect, type Page } from '@playwright/test';
import { E2E_DATABASE_PATH } from '../playwright.config';

/**
 * The suite makes exactly ten registration attempts (the throttle limit) per address.
 * Clears only the `registration` scope — per-username and per-address scopes are left intact
 * so intentional sign-in failures still count against the throttle.
 */
export function clearRegistrationThrottle(): void {
	// `data/runtime` is gitignored and created lazily by the server; if absent, nothing has been counted.
	if (!existsSync(E2E_DATABASE_PATH)) return;
	const database = new DatabaseSync(E2E_DATABASE_PATH);
	try {
		// Parallel workers and the preview server share this file; avoids SQLITE_BUSY flakes.
		database.exec('pragma busy_timeout = 5000');
		// Schema is created lazily by the server; no table means nothing was counted.
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
 * Spelled out rather than imported from `state/session.svelte.ts` (compiled Svelte, can't run in Node).
 * A spec beside that module asserts the same string, so a rename is caught.
 */
const SESSION_STORAGE_KEY = 'fit.session.v1';

const PASSWORD = 'salt-and-pepper-mill';

/**
 * UUID is unique per run (the DB file persists) and its chars fit the server's allowed set.
 * Also keeps per-username throttle from bleeding across tests.
 */
export function freshUsername(): string {
	return `e2e-${randomUUID().slice(0, 13)}`;
}

/**
 * Registers via API (not the form) so failures below are attributable.
 * `page.request` shares the cookie jar; the `localStorage` record is written via `addInitScript`
 * because the shell reads it (the cookie is HttpOnly). `origin` header is required by `hooks.server.ts`.
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
	// `addInitScript` runs on every page load; seeding unconditionally would resurrect sessions after sign-out.
	// The `sessionStorage` flag ensures the seed happens once per tab.
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
