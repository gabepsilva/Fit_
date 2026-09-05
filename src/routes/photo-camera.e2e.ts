import { expect, type Page } from '@playwright/test';
import { test } from '../../tests/preview-server';
import { openEmptyJournal, openLogSheet, signInThroughApi } from '../../tests/e2e-support';

/**
 * The camera route of photo mode, end to end through the browser.
 *
 * `photo-log.e2e.ts` drives everything on the far side of `getUserMedia`
 * through the Upload tab, because WebKit and Firefox in this suite have no
 * camera to open. This file is the other half: it runs only where Playwright
 * can fake one, which today is Chromium (`--use-fake-ui-for-media-stream` /
 * `--use-fake-device-for-media-stream`). `playwright.config.ts` keeps this
 * file out of the non-Chromium projects' `testIgnore` rather than skipping
 * tests at runtime, per `eslint-plugin-playwright/no-skipped-test`.
 *
 * `/api/meals/photo` is stubbed for the same reason `photo-log.e2e.ts` stubs
 * it: the endpoint spends real money and needs a catalog this environment
 * does not have.
 */

async function stubPhoto(page: Page, status: number, body: unknown): Promise<void> {
	await page.route('**/api/meals/photo', (route) =>
		route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
	);
}

async function openPhotoTab(page: Page): Promise<void> {
	await openLogSheet(page);
	await page.getByRole('button', { name: 'Photo' }).click();
}

test.use({
	launchOptions: {
		args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
	},
	permissions: ['camera']
});

test.describe('camera mode', () => {
	test.beforeEach(async ({ page, baseURL }) => {
		await signInThroughApi(page, baseURL ?? '');
		await openEmptyJournal(page);
	});

	test('overlays the shutter on the preview, centred, instead of a button below it', async ({
		page
	}) => {
		await openPhotoTab(page);

		const shutter = page.getByRole('button', { name: 'Take photo' });
		await expect(shutter).toBeVisible();
		// No leftover text button from the old layout.
		await expect(page.getByRole('button', { name: 'Take the picture' })).toHaveCount(0);

		const video = page.getByLabel('Camera viewfinder');
		await expect(video).toBeVisible();

		type Box = { x: number; y: number; width: number; height: number };
		const rawShutterBox = await shutter.boundingBox();
		const rawPreviewBox = await video.boundingBox();
		expect(rawShutterBox).not.toBeNull();
		expect(rawPreviewBox).not.toBeNull();
		const shutterBox = rawShutterBox as Box;
		const previewBox = rawPreviewBox as Box;

		// Inside the preview...
		expect(shutterBox.x).toBeGreaterThanOrEqual(previewBox.x);
		expect(shutterBox.y).toBeGreaterThanOrEqual(previewBox.y);
		expect(shutterBox.x + shutterBox.width).toBeLessThanOrEqual(previewBox.x + previewBox.width);
		expect(shutterBox.y + shutterBox.height).toBeLessThanOrEqual(previewBox.y + previewBox.height);

		// ...and centred within it.
		const shutterCenterX = shutterBox.x + shutterBox.width / 2;
		const previewCenterX = previewBox.x + previewBox.width / 2;
		expect(Math.abs(shutterCenterX - previewCenterX)).toBeLessThanOrEqual(2);
	});

	test('takes the still and moves on to reading it', async ({ page }) => {
		await stubPhoto(page, 200, { items: [] });
		await openPhotoTab(page);

		const shutter = page.getByRole('button', { name: 'Take photo' });
		await expect(shutter).toBeEnabled();
		await shutter.click();

		await expect(page.getByAltText('What the camera just saw')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Read this plate' })).toBeVisible();
	});
});
