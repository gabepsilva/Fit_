import { expect, test, type Page } from '@playwright/test';
import {
	clearRegistrationThrottle,
	freshUsername,
	toastsCleared
} from '../../../tests/e2e-support';
import AxeBuilder from '@axe-core/playwright';

/**
 * Creating an account, which is how a new device gets in at all. Registration
 * is the only path that necessarily answers "does this username exist", so the
 * taken name is exercised here and nowhere else.
 */

/** Ten characters is the server's floor, so the happy path clears it by a margin. */
const PASSWORD = 'salt-and-pepper-mill';

async function axeViolations(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	// Returned rather than asserted here, so each test carries its own assertion.
	return results.violations;
}

/**
 * Take the route a person takes: ask for the app, be given the sign-in form,
 * and follow the offer to create one. The gate is the only way in, so this is
 * the only way here.
 */
async function reachSignUp(page: Page) {
	await page.goto('/');
	await page.getByRole('link', { name: 'Create one' }).click();
	await expect(page.getByRole('heading', { name: 'Create an account', level: 1 })).toBeVisible();
}

/** Fill the three boxes that are not optional and submit. */
async function submitAccount(page: Page, username: string, password = PASSWORD) {
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Name', { exact: true }).fill('Robin');
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Create account' }).click();
}

test.beforeEach(clearRegistrationThrottle);

test.describe('creating an account', () => {
	test.beforeEach(async ({ page }) => {
		await reachSignUp(page);
	});

	test('states the rules before anything is rejected', async ({ page }) => {
		await expect(page.getByText('3 to 32 characters: letters, digits, and . _ -')).toBeVisible();
		await expect(page.getByText('At least 10 characters. Length beats punctuation.')).toBeVisible();
		// The household is named here because registration creates one, and it is
		// optional because the display name already answers the question.
		await expect(page.getByLabel('Household')).toBeVisible();
	});

	test('has no detectable accessibility violations', async ({ page }) => {
		expect(await axeViolations(page)).toEqual([]);
	});

	test('signs the new account in and opens the app', async ({ page }) => {
		const username = freshUsername();
		await submitAccount(page, username);

		await expect(page.getByText('Welcome, Robin.')).toBeVisible();
		// A new account on a new device opens on the first run rather than on a
		// journal: registering creates the account, not the journal.
		await expect(page.getByRole('heading', { name: 'Tend' })).toBeVisible();

		// And the drawer, once there is one, names who is signed in.
		//
		// The welcome toast lands on the button below. See `toastsCleared`.
		await toastsCleared(page);
		await page.getByRole('button', { name: 'Continue' }).click();
		await page.getByRole('button', { name: 'Continue' }).click();
		await page.getByRole('button', { name: 'Open the sample journal' }).click();
		await page.getByRole('button', { name: 'Open menu' }).click();
		await expect(page.getByText('Robin', { exact: true })).toBeVisible();
		await expect(page.getByText(`@${username}`)).toBeVisible();
	});

	test('refuses a short password under the password box', async ({ page }) => {
		await submitAccount(page, freshUsername(), 'short');

		await expect(page.getByText('At least 10 characters.', { exact: true })).toBeVisible();
		await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true');
		// Nothing was created, so the form is still the page being looked at.
		await expect(page.getByRole('heading', { name: 'Create an account', level: 1 })).toBeVisible();
	});

	test('refuses a username the shape rules do not allow', async ({ page }) => {
		await submitAccount(page, 'no');

		await expect(page.getByText('At least 3 characters.')).toBeVisible();
		await expect(page.getByLabel('Username')).toHaveAttribute('aria-invalid', 'true');
	});

	test('names the characters a username may use', async ({ page }) => {
		await submitAccount(page, 'robin!!');

		await expect(page.getByText('Letters, digits, and . _ - only.')).toBeVisible();
	});

	test('has no detectable accessibility violations with a field rejected', async ({ page }) => {
		await submitAccount(page, freshUsername(), 'short');
		await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true');
		expect(await axeViolations(page)).toEqual([]);
	});
});

/**
 * The second sign-up for one name. The form is reached directly the second
 * time because the gate no longer stands between this device and the app,
 * which is the state the first registration leaves behind.
 */
test('says a username is taken, under the box that holds it', async ({ page }) => {
	const username = freshUsername();
	await reachSignUp(page);
	await submitAccount(page, username);
	await expect(page.getByRole('heading', { name: 'Tend' })).toBeVisible();

	await page.goto('/signup');
	await submitAccount(page, username);

	await expect(page.getByText('That username is taken.')).toBeVisible();
	await expect(page.getByLabel('Username')).toHaveAttribute('aria-invalid', 'true');
});
