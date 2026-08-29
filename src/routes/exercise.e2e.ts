import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The exercise tab from the outside: pick a starting point, train, and see what
 * was filed. Onboarding seeds meals but no training, so every run starts from
 * the same empty rotation and the journey below is the one a new user takes.
 */
async function onboard(page: Page) {
	await page.goto('/');
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.getByRole('button', { name: 'Open the sample journal' }).click();
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('link', { name: 'Exercise' }).click();
	await expect(page.getByRole('heading', { name: 'Nothing here yet', level: 1 })).toBeVisible();
}

/**
 * Every screen of the tab is scanned rather than only the two obvious ones: the
 * palette is reused at different tints across the planner, the sheets and the
 * session, and contrast is exactly what that quietly breaks.
 */
async function axeViolations(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	// Returned rather than asserted here, so each test carries its own assertion.
	return results.violations;
}

/** Take the two-day template, which is the shortest route to a routine. */
async function pickFullBody(page: Page) {
	await page.getByRole('button', { name: /Full body/ }).click();
	await expect(page.getByRole('heading', { name: 'Exercise', level: 1 })).toBeVisible();
}

test.describe('with nothing planned yet', () => {
	test.beforeEach(async ({ page }) => {
		await onboard(page);
	});

	test('offers starting points rather than an empty page', async ({ page }) => {
		await expect(page.getByRole('button', { name: /Full body/ })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Build one from scratch' })).toBeVisible();
	});

	test('has no detectable accessibility violations', async ({ page }) => {
		expect(await axeViolations(page)).toEqual([]);
	});

	test('a template leaves a routine in the rotation', async ({ page }) => {
		await pickFullBody(page);
		await expect(page.getByRole('link', { name: /Full body/ })).toBeVisible();
		await expect(page.getByText('1 in rotation')).toBeVisible();
	});

	test('building from scratch opens the builder', async ({ page }) => {
		await page.getByRole('button', { name: 'Build one from scratch' }).click();
		await expect(page.getByRole('button', { name: 'Add from library' })).toBeVisible();
	});
});

test.describe('once a routine is in the rotation', () => {
	test.beforeEach(async ({ page }) => {
		await onboard(page);
		await pickFullBody(page);
	});

	test('runs a session and files what was done', async ({ page }) => {
		await page.getByRole('button', { name: 'Start Full body' }).click();
		await expect(page.getByRole('heading', { name: 'Squat', level: 1 })).toBeVisible();

		await page.getByRole('button', { name: 'Set 1 done' }).click();
		await expect(page.getByRole('button', { name: 'Set 1 done' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		await page.getByRole('button', { name: 'Finish' }).click();
		await expect(page.getByRole('heading', { name: 'Full body', level: 1 })).toBeVisible();
		await expect(page.getByText('Session done', { exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'What you did' })).toBeVisible();
	});

	test('leaving a session with nothing ticked files nothing', async ({ page }) => {
		await page.getByRole('button', { name: 'Start Full body' }).click();
		await page.getByRole('button', { name: 'Finish' }).click();
		// Straight back to the rotation, because there is no session to show.
		await expect(page.getByRole('heading', { name: 'Exercise', level: 1 })).toBeVisible();
	});

	test('keeps a session running across a reload', async ({ page }) => {
		await page.getByRole('button', { name: 'Start Full body' }).click();
		await page.getByRole('button', { name: 'Set 1 done' }).click();
		await page.reload();
		await expect(page.getByRole('button', { name: 'Set 1 done' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
	});

	test('opens the routine as a sheet, grouped by muscle', async ({ page }) => {
		await page.getByRole('link', { name: /Full body/ }).click();
		await expect(page.getByText('Legs', { exact: true }).first()).toBeVisible();
		await expect(page.getByRole('button', { name: 'Start this session' })).toBeVisible();
	});

	test('plans a week from the month view', async ({ page }) => {
		await page.getByRole('link', { name: 'Plan', exact: true }).click();
		await expect(page.getByRole('link', { name: 'Year' })).toBeVisible();
		await page.getByRole('button', { name: /Apply to all/ }).click();
		await page.getByRole('link', { name: 'Year' }).click();
		await expect(page.getByText(/\/52 planned/)).toBeVisible();
	});

	test('reaches training progress, which waits for a finished session', async ({ page }) => {
		await page.getByRole('link', { name: 'Training progress' }).click();
		await expect(page.getByText(/nothing here to chart/)).toBeVisible();
	});

	test('has no detectable accessibility violations on the rotation', async ({ page }) => {
		expect(await axeViolations(page)).toEqual([]);
	});

	test('has no detectable accessibility violations mid-session', async ({ page }) => {
		await page.getByRole('button', { name: 'Start Full body' }).click();
		await expect(page.getByRole('heading', { name: 'Squat', level: 1 })).toBeVisible();
		await page.getByRole('button', { name: 'Set 1 done' }).click();
		expect(await axeViolations(page)).toEqual([]);
	});

	test('has no detectable accessibility violations on the routine sheet', async ({ page }) => {
		await page.getByRole('link', { name: /Full body/ }).click();
		await expect(page.getByRole('button', { name: 'Start this session' })).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});

	test('has no detectable accessibility violations in the library', async ({ page }) => {
		await page.getByRole('link', { name: /Full body/ }).click();
		await page.getByRole('link', { name: 'Edit' }).click();
		await page.getByRole('button', { name: 'Add from library' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});

	test('has no detectable accessibility violations while planning', async ({ page }) => {
		await page.getByRole('link', { name: 'Plan', exact: true }).click();
		await expect(page.getByRole('button', { name: /Apply to all/ })).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});

	test('has no detectable accessibility violations picking a week', async ({ page }) => {
		await page.getByRole('link', { name: 'Plan', exact: true }).click();
		await page.getByRole('link', { name: 'Year' }).click();
		await page.getByRole('button', { name: /^Week 40/ }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});

	test('has no detectable accessibility violations reading progress back', async ({ page }) => {
		await page.getByRole('button', { name: 'Start Full body' }).click();
		await page.getByRole('button', { name: 'Set 1 done' }).click();
		await page.getByRole('button', { name: 'Finish' }).click();
		await expect(page.getByText('Session done', { exact: true })).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
		await page.getByRole('link', { name: 'See training progress' }).click();
		await expect(page.getByText(/top set/)).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
});
