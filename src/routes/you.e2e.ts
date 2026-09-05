import { expect, type Page } from '@playwright/test';
import { test } from '../../tests/preview-server';
import { openEmptyJournal, signInThroughApi } from '../../tests/e2e-support';

/**
 * Height (#93): asked once in onboarding, then unreachable on any screen — a
 * mistyped height had no fix short of deleting the whole journal. These
 * tests drive the real `/you` screen rather than the domain functions
 * directly, so a UI-level regression (e.g. losing the edit, or a rounding
 * drift like the one PR #73 fixed for weight) is caught too.
 */

async function openYou(page: Page) {
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('link', { name: 'You' }).click();
	await expect(page.getByRole('heading', { name: 'You', level: 1 })).toBeVisible();
}

test.describe('height on the You screen', () => {
	test.beforeEach(async ({ page, baseURL }) => {
		await signInThroughApi(page, baseURL ?? '');
		await openEmptyJournal(page);
	});

	test('shows the onboarded height and lets it be edited', async ({ page }) => {
		await openYou(page);
		const height = page.getByLabel('Height in centimeters');
		await expect(height).toHaveValue('168');
		await expect(page.getByText('cm', { exact: true })).toBeVisible();

		await height.fill('180');
		await page.getByRole('button', { name: 'Save height' }).click();

		await page.reload();
		await openYou(page);
		await expect(page.getByLabel('Height in centimeters')).toHaveValue('180');
	});

	test('reads and saves height in feet and inches under the imperial preference', async ({
		page
	}) => {
		await openYou(page);
		await page.getByRole('button', { name: 'Imperial' }).click();
		await expect(page.getByLabel('Height, feet')).toHaveValue('5');
		await expect(page.getByLabel('Height, inches')).toHaveValue('6');
		await expect(page.getByText('ft', { exact: true })).toBeVisible();
		await expect(page.getByText('in', { exact: true })).toBeVisible();

		await page.getByLabel('Height, feet').fill('5');
		await page.getByLabel('Height, inches').fill('9');
		await page.getByRole('button', { name: 'Save height' }).click();

		await page.reload();
		await openYou(page);
		await expect(page.getByLabel('Height, feet')).toHaveValue('5');
		await expect(page.getByLabel('Height, inches')).toHaveValue('9');
	});

	test('hides the household feature', async ({ page }) => {
		await openYou(page);
		await expect(page.getByRole('heading', { name: 'Household' })).toHaveCount(0);
	});
});
