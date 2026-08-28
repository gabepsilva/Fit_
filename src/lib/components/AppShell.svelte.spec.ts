import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { emptyProfile } from '$lib/domain/demo-seed';
import { logUi } from '$lib/state/log-ui.svelte';
import { STORAGE_KEY, tend } from '$lib/state/tend.svelte';
import AppShellHarness from './AppShellHarness.svelte';

/** Put a completed onboarding into storage, the way a returning visit would find it. */
function seedOnboardedStorage() {
	const store = { onboarded: true, activeProfileId: 'p1', profiles: [], weekPlan: [], pantry: [] };
	store.profiles = [{ ...emptyProfile({ name: 'Alex' }), id: 'p1' }] as never;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

beforeEach(() => {
	localStorage.clear();
	logUi.open = false;
	logUi.tab = 'type';
	tend.resetAll();
	tend.hydrated = false;
});

describe('AppShell', () => {
	it('shows onboarding to someone who has not onboarded', async () => {
		await render(AppShellHarness, { props: { body: 'Page body' } });
		await expect.element(page.getByText('A quieter tracker')).toBeInTheDocument();
	});

	it('does not show the page content during onboarding', async () => {
		await render(AppShellHarness, { props: { body: 'Page body' } });
		expect(document.body.textContent).not.toContain('Page body');
	});

	it('shows the page to someone who has onboarded', async () => {
		seedOnboardedStorage();
		await render(AppShellHarness, { props: { body: 'Page body' } });
		await expect.element(page.getByText('Page body')).toBeInTheDocument();
	});

	it('keeps the navigation behind the menu button until it is asked for', async () => {
		seedOnboardedStorage();
		await render(AppShellHarness, { props: { body: 'Page body' } });
		await expect.element(page.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it('offers the five navigation destinations once the menu is open', async () => {
		seedOnboardedStorage();
		await render(AppShellHarness, { props: { body: 'Page body' } });
		await page.getByRole('button', { name: 'Open menu' }).click();
		for (const label of ['Today', 'Progress', 'Exercise', 'Plan', 'You']) {
			await expect.element(page.getByRole('link', { name: label })).toBeInTheDocument();
		}
	});

	it('closes the menu again from its close control', async () => {
		seedOnboardedStorage();
		await render(AppShellHarness, { props: { body: 'Page body' } });
		await page.getByRole('button', { name: 'Open menu' }).click();
		await page.getByRole('button', { name: 'Close menu' }).click();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});

	// Which destination reads as current depends on real routing, so that is
	// asserted end to end rather than here.

	it('opens the log sheet from the top bar', async () => {
		seedOnboardedStorage();
		await render(AppShellHarness, { props: { body: 'Page body' } });
		await page.getByRole('button', { name: 'Log food' }).click();
		expect(logUi.open).toBe(true);
	});

	it('opens the log sheet from the camera too', async () => {
		seedOnboardedStorage();
		await render(AppShellHarness, { props: { body: 'Page body' } });
		await page.getByRole('button', { name: 'Log from a photo' }).click();
		expect(logUi.open).toBe(true);
	});

	it('takes the camera straight to the photo tab', async () => {
		seedOnboardedStorage();
		await render(AppShellHarness, { props: { body: 'Page body' } });
		await page.getByRole('button', { name: 'Log from a photo' }).click();
		expect(logUi.tab).toBe('photo');
	});

	it('leaves the plain log action on the typing tab', async () => {
		seedOnboardedStorage();
		await render(AppShellHarness, { props: { body: 'Page body' } });
		await page.getByRole('button', { name: 'Log food' }).click();
		expect(logUi.tab).toBe('type');
	});
});
