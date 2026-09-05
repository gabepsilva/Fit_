import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from '../../../tests/preview-server';
import { freshUsername, openSampleJournal, signOutThroughDrawer } from '../../../tests/e2e-support';
import AxeBuilder from '@axe-core/playwright';

/**
 * Signing in is how the app opens: the form is the first screen an
 * unauthenticated visitor sees. Signing in opens the app rather than fetching
 * anything, so a device comes back to exactly the journal it had.
 */

const PASSWORD = 'salt-and-pepper-mill';
const DISPLAY_NAME = 'Robin';

// Seeded via API to keep this file's scope to the sign-in form.
// The origin header is required by the server's CSRF check.
async function seedAccount(request: APIRequestContext, baseURL: string, username: string) {
	const response = await request.post('/api/accounts', {
		headers: { origin: new URL(baseURL).origin },
		data: { username, displayName: DISPLAY_NAME, password: PASSWORD, householdName: 'Kitchen' }
	});
	expect(response.status()).toBe(201);
}

async function axeViolations(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	// Returned, not asserted: each test makes its own a11y assertion.
	return results.violations;
}

/** Ask for the app and be handed the form; no link is clicked, there is no earlier screen. */
async function reachSignIn(page: Page, path = '/') {
	await page.goto(path);
	await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
}

async function attempt(page: Page, username: string, password: string) {
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('the sign-in form', () => {
	test.beforeEach(async ({ page }) => {
		await reachSignIn(page);
	});

	test('says what an account is for, and offers to create one', async ({ page }) => {
		await expect(page.getByText('Fit_ opens once you are signed in.')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Create one' })).toBeVisible();
	});

	test('has no detectable accessibility violations', async ({ page }) => {
		expect(await axeViolations(page)).toEqual([]);
	});

	test('describes a wrong password without confirming the name', async ({ page }) => {
		await attempt(page, freshUsername(), PASSWORD);
		await expect(page.getByRole('alert')).toHaveText('That username and password don’t match.');
	});

	test('has no detectable accessibility violations with the form refused', async ({ page }) => {
		await attempt(page, freshUsername(), PASSWORD);
		await expect(page.getByRole('alert')).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
});

test.describe('with an account already registered', () => {
	let username = '';

	test.beforeEach(async ({ page, request, baseURL }) => {
		username = freshUsername();
		await seedAccount(request, baseURL ?? '', username);
		await reachSignIn(page);
	});

	test('signs in and opens the app', async ({ page }) => {
		await attempt(page, username, PASSWORD);

		// This device has no journal yet, so what it opens on is the first run.
		await expect(page.getByRole('heading', { name: 'Tend' })).toBeVisible();
	});

	test('names the account in the drawer', async ({ page }) => {
		await attempt(page, username, PASSWORD);
		await openSampleJournal(page);
		await page.getByRole('button', { name: 'Open menu' }).click();
		await expect(page.getByText(`@${username}`, { exact: true })).toBeVisible();
	});

	test('brings the journal back from the account it belongs to', async ({ page }) => {
		await attempt(page, username, PASSWORD);
		await openSampleJournal(page);
		await signOutThroughDrawer(page);

		// Signing out empties the device — `sync.e2e.ts` asserts that directly —
		// so what comes back here comes back from the server, not from storage.
		await attempt(page, username, PASSWORD);
		await expect(page.getByRole('heading', { name: 'breakfast' })).toBeVisible();
	});

	test('returns to the destination it turned away', async ({ page }) => {
		await attempt(page, username, PASSWORD);
		await openSampleJournal(page);
		await signOutThroughDrawer(page);

		await reachSignIn(page, '/progress');
		await attempt(page, username, PASSWORD);
		await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
	});

	/**
	 * The regression the toaster's placement exists for.
	 *
	 * `AccountMenu` raises this after `session.forget()`, which has already
	 * swapped the branch that menu was rendered in — so a toaster mounted
	 * inside that branch is unmounted mid-announcement and the sentence never
	 * arrives. Signing in used to cover this by announcing itself over the app
	 * it opened; it no longer says anything, and this is the case that is left.
	 */
	test('still says the session ended, after the screen has already changed', async ({ page }) => {
		await attempt(page, username, PASSWORD);
		await openSampleJournal(page);
		await page.getByRole('button', { name: 'Open menu' }).click();
		await page.getByRole('button', { name: 'Sign out', exact: true }).click();

		await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
		await expect(page.getByText('Signed out.')).toBeVisible();
	});

	test('says the same thing to a wrong password as to a wrong name', async ({ page }) => {
		await attempt(page, username, 'not-the-password');
		await expect(page.getByRole('alert')).toHaveText('That username and password don’t match.');

		// Prove the form still submits after a rejection.
		await page.getByLabel('Password').fill(PASSWORD);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByRole('heading', { name: 'Tend' })).toBeVisible();
	});

	test('has no detectable accessibility violations once signed in', async ({ page }) => {
		await attempt(page, username, PASSWORD);
		await openSampleJournal(page);
		await page.getByRole('button', { name: 'Open menu' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
});
