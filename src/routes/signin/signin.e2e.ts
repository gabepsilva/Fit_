import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Signing in on a device that already has a journal. The account is added to
 * what is there rather than unlocking it, so every assertion below is about
 * the form and the drawer, never about a page that was gated.
 */

/**
 * A name no other run has used, for the same reason the sign-up flow needs
 * one: the preview server's database is a file that outlives the suite. The
 * throttle also counts failures per username, so a name of its own keeps a
 * test that fails a sign-in on purpose from locking out the next one.
 */
function freshUsername(): string {
	return `e2e-${randomUUID().slice(0, 13)}`;
}

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

/** Onboard, then reach the form the way the drawer offers it. */
async function reachSignIn(page: Page) {
	await page.goto('/');
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.getByRole('button', { name: 'Open the sample journal' }).click();
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('link', { name: 'Sign in' }).click();
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
		await expect(page.getByText('Your journal stays on this device either way.')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Create one' })).toBeVisible();
	});

	test('has no detectable accessibility violations', async ({ page }) => {
		expect(await axeViolations(page)).toEqual([]);
	});

	test('describes a wrong password without confirming the name', async ({ page }) => {
		await attempt(page, freshUsername(), PASSWORD);
		await expect(page.getByRole('alert')).toHaveText('That username and password don’t match.');
	});

	test('refuses a device label over a hundred characters', async ({ page }) => {
		await page.getByLabel('Name this device').fill('d'.repeat(101));
		await attempt(page, freshUsername(), PASSWORD);

		await expect(page.getByText('At most 100 characters.')).toBeVisible();
		await expect(page.getByLabel('Name this device')).toHaveAttribute('aria-invalid', 'true');
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

	test('signs in and comes back to the journal it left', async ({ page }) => {
		await attempt(page, username, PASSWORD);

		await expect(page.getByText(`Signed in as ${DISPLAY_NAME}.`)).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

		await page.getByRole('button', { name: 'Open menu' }).click();
		await expect(page.getByText(`@${username} · Kitchen`)).toBeVisible();
	});

	test('leaves the journal exactly where it was', async ({ page }) => {
		await attempt(page, username, PASSWORD);
		// The sample journal is still the one on screen: an account is added to a
		// journal here, it does not fetch one.
		await expect(page.getByRole('heading', { name: 'breakfast' })).toBeVisible();
	});

	test('says the same thing to a wrong password as to a wrong name', async ({ page }) => {
		await attempt(page, username, 'not-the-password');
		await expect(page.getByRole('alert')).toHaveText('That username and password don’t match.');

		// And the right one still works afterwards, so the sentence above is a
		// rejection rather than a form that has stopped submitting.
		await page.getByLabel('Password').fill(PASSWORD);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
	});

	test('has no detectable accessibility violations once signed in', async ({ page }) => {
		await attempt(page, username, PASSWORD);
		await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
		await page.getByRole('button', { name: 'Open menu' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
});
