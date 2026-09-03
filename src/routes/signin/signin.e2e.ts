import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { clearRegistrationThrottle, freshUsername, toastCleared } from '../../../tests/e2e-support';
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

/** Take the sample journal, so there is something on the device to come back to. */
async function openSampleJournal(page: Page) {
	// Signing in toasts, and the toast lands on the button below. Waited for by
	// name before it is waited out, because this runs a moment after the submit
	// that raises it and an empty toaster here would mean "not yet" rather than
	// "gone". See `toastCleared`.
	await expect(page.getByText(`Signed in as ${DISPLAY_NAME}.`)).toBeVisible();
	await toastCleared(page);
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.getByRole('button', { name: 'Open the sample journal' }).click();
	await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
}

/** End the session from the drawer, which is the only place that offers it. */
async function signOut(page: Page) {
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
}

async function attempt(page: Page, username: string, password: string) {
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

test.beforeEach(clearRegistrationThrottle);

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

		await expect(page.getByText(`Signed in as ${DISPLAY_NAME}.`)).toBeVisible();
		// This device has no journal yet, so what it opens on is the first run.
		await expect(page.getByRole('heading', { name: 'Tend' })).toBeVisible();
	});

	test('names the account and the household in the drawer', async ({ page }) => {
		await attempt(page, username, PASSWORD);
		await openSampleJournal(page);
		await page.getByRole('button', { name: 'Open menu' }).click();
		await expect(page.getByText(`@${username} · Kitchen`)).toBeVisible();
	});

	test('leaves the journal exactly where it was', async ({ page }) => {
		await attempt(page, username, PASSWORD);
		await openSampleJournal(page);
		await signOut(page);

		// Signing out closes the app; it does not empty the device.
		await attempt(page, username, PASSWORD);
		await expect(page.getByRole('heading', { name: 'breakfast' })).toBeVisible();
	});

	test('returns to the destination it turned away', async ({ page }) => {
		await attempt(page, username, PASSWORD);
		await openSampleJournal(page);
		await signOut(page);

		await reachSignIn(page, '/progress');
		await attempt(page, username, PASSWORD);
		await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
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
