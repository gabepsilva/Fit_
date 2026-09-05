import { expect, type Page } from '@playwright/test';
import { test } from '../../tests/preview-server';
import { openEmptyJournal, openLogSheet, signInThroughApi } from '../../tests/e2e-support';

/**
 * Logging a meal from a photo, end to end through the browser.
 *
 * `/api/meals/photo` is stubbed here for two reasons, and both are permanent:
 * the endpoint spends real money at OpenAI, and it needs the 365 MB food
 * catalog that is not in the repository and not in CI. What is real below is
 * everything on this side of that contract — the file picker, the JPEG the
 * browser encodes, the request the client builds, the proposals the sheet makes
 * of the answer, and the journal entry that comes out. What is not proven here
 * is that the live model returns this shape; `vision.spec.ts` asserts the
 * request and the parse against the recorded upstream shape instead.
 *
 * The camera route (`readPhoto`/`readImageFile` aside) is driven separately,
 * in `photo-camera.e2e.ts`, on the Chromium-based projects only: Playwright's
 * fake video device flags give `getUserMedia` a real, if synthetic, stream
 * there. WebKit and Firefox have no equivalent flag, so the Upload tab and its
 * file picker stay the way every project proves the read/parse path here, and
 * only the shutter's shape and placement are proven through the live camera.
 */

const CEREAL = {
	id: 4213,
	name: 'HONEY NUT CHEERIOS',
	brand: 'GENERAL MILLS',
	kind: 'branded',
	category: 'Breakfast Cereals',
	barcode: '00016000275287',
	license: 'PDDL-1.0',
	serving: { label: '3/4 cup', grams: 37 },
	per100g: {
		kcal: 375,
		protein: 8.1,
		fat: 4.5,
		carbs: 78.4,
		sugar: 24.3,
		fiber: 8.1,
		sodium: 500,
		saturatedFat: 0.7
	}
};

/** A tiny JPEG, so the picker has something real to decode. */
const PLATE = 'tests/fixtures/plate.jpg';

async function stubPhoto(page: Page, status: number, body: unknown): Promise<void> {
	await page.route('**/api/meals/photo', (route) =>
		route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
	);
}

/** Open the sheet on the Upload tab and hand the picker the fixture. */
async function chooseThePlate(page: Page): Promise<void> {
	await openLogSheet(page);
	// The tab opens the picker as it mounts, so the handler has to be waiting first.
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Upload' }).click();
	await (await chooser).setFiles(PLATE);
	await expect(page.getByRole('button', { name: 'Read this plate' })).toBeVisible();
}

test.describe('reading a meal from a photo', () => {
	test.beforeEach(async ({ page, baseURL }) => {
		await signInThroughApi(page, baseURL ?? '');
		await openEmptyJournal(page);
	});

	test('turns what the photo held into proposals, and logs the one the catalog knew', async ({
		page
	}) => {
		await stubPhoto(page, 200, {
			items: [
				{ label: 'a bowl of cereal', grams: 74, food: CEREAL, alternatives: [] },
				{ label: 'something green', grams: 40, food: null, alternatives: [] }
			]
		});
		await chooseThePlate(page);
		await page.getByRole('button', { name: 'Read this plate' }).click();

		await expect(page.getByText('HONEY NUT CHEERIOS').first()).toBeVisible();
		await expect(page.getByText('something green').first()).toBeVisible();
		await expect(page.getByText('Found 2 foods in the photo.')).toBeVisible();

		await page.getByRole('button', { name: 'Add to today' }).click();
		await expect(page.getByRole('dialog')).toBeHidden();
		// The unmatched one carries no nutrition, so only the catalog food is logged.
		await expect(page.getByText('HONEY NUT CHEERIOS').first()).toBeVisible();
		await expect(page.getByText('something green')).toBeHidden();
	});

	test('says photo logging is off, and keeps the picture, when the server cannot read it', async ({
		page
	}) => {
		await stubPhoto(page, 503, { error: { code: 'photo-unavailable' } });
		await chooseThePlate(page);
		await page.getByRole('button', { name: 'Read this plate' }).click();

		await expect(page.getByText(/Photo logging isn’t available right now/)).toBeVisible();
		await expect(page.getByAltText('The picture you chose')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Type it instead' })).toBeVisible();
	});
});
