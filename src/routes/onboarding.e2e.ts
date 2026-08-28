import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('first visit', () => {
	test('opens on the welcome step', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Tend' })).toBeVisible();
	});

	test('leads with the promise that a missed day is fine', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByText('No red days.')).toBeVisible();
	});

	test('has no detectable accessibility violations', async ({ page }) => {
		await page.goto('/');
		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(results.violations).toEqual([]);
	});
});

test.describe('once onboarded', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Continue' }).click();
		await page.getByRole('button', { name: 'Continue' }).click();
		await page.getByRole('button', { name: 'Open the sample journal' }).click();
		await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
	});

	test('shows today with the day’s log', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'breakfast' })).toBeVisible();
	});

	test('marks the current destination in the navigation', async ({ page }) => {
		await expect(page.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
	});

	test('navigates to progress and moves the current marker', async ({ page }) => {
		await page.getByRole('link', { name: 'Progress' }).click();
		await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Progress' })).toHaveAttribute(
			'aria-current',
			'page'
		);
	});

	test('navigates to the plan', async ({ page }) => {
		await page.getByRole('link', { name: 'Plan' }).click();
		await expect(page.getByRole('heading', { name: 'Plan', level: 1 })).toBeVisible();
	});

	test('navigates to the profile', async ({ page }) => {
		await page.getByRole('link', { name: 'You' }).click();
		await expect(page.getByRole('heading', { name: 'You', level: 1 })).toBeVisible();
	});

	test('logs a food through the sheet', async ({ page }) => {
		await page.getByRole('button', { name: 'Log food' }).click();
		await page.getByLabel('What you ate').fill('two eggs');
		await page.getByRole('button', { name: 'Parse' }).click();
		await page.getByRole('button', { name: 'Add to today' }).click();
		await expect(page.getByRole('dialog')).toBeHidden();
	});

	test('keeps the journal across a reload', async ({ page }) => {
		await page.reload();
		await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
	});
});
