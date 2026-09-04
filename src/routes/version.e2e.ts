import { expect } from '@playwright/test';
import { test } from '../../tests/preview-server';
import { openEmptyJournal, signInThroughApi } from '../../tests/e2e-support';

/**
 * That the running build says which build it is.
 *
 * A pull request build has no tag to describe, so the string is the
 * `v0.0.1+<sha>` fallback rather than a release number — which is the point of
 * asserting the shape and not a value: the display is provable here, on a
 * branch, without waiting for a tag to exist.
 */
test('the side navigation says which build this is', async ({ page, baseURL }) => {
	await signInThroughApi(page, baseURL ?? '');
	await openEmptyJournal(page);
	await page.getByRole('button', { name: 'Open menu' }).click();

	await expect(page.getByText(/^v\d+\.\d+\.\d+/)).toBeVisible();
});
