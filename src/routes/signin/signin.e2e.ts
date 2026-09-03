import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { clearRegistrationThrottle, freshUsername } from '../../../tests/e2e-support';
import AxeBuilder from '@axe-core/playwright';

/**
 * Signing in is how the app opens. The form is the first screen an
 * unauthenticated visitor sees, so it is reached by asking for the app rather
 * than by finding a link in a drawer that is itself behind the gate.
 *
 * The journal is still this device's. Signing in opens the app rather than
 * fetching anything, which is why a device that already has one comes back to
 * exactly the journal it had.
 */

const PASSWORD = 'salt-and-pepper-mill';
const DISPLAY_NAME = 'Robin';

/**
 * Seed an account through the endpoint rather than through the sign-up form:
 * this file is about the sign-in page, and a second flow in the setup would
 * make its failures ambiguous.
 *
 * The `origin` header is the one thing an API context has to say for itself.
 * `hooks.server.ts` refuses an unsafe request that does not declare where it
 * came from, because a browser always declares it and anything that does not
 * is either not a browser or is hiding. Playwright's `request` fixture is the
 * former, and it also carries its own cookie jar, so seeding never leaves the
 * page holding a session it did not sign in for.
 */
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
	// Returned rather than asserted here, so each test carries its own assertion.
	return results.violations;
}

/**
 * Ask for the app, and be handed the form. No link is clicked to get here:
 * there is no screen with a link on it before this one.
 */
async function reachSignIn(page: Page, path = '/') {
	await page.goto(path);
	await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
}

/** Take the sample journal, so there is something on the device to come back to. */
async function openSampleJournal(page: Page) {
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

		// Signing out closes the app; it does not empty the device. The same
		// journal is behind the form, waiting for the same account.
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

		// And the right one still works afterwards, so the sentence above is a
		// rejection rather than a form that has stopped submitting.
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
