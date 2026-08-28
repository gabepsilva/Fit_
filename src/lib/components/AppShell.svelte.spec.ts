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

	it('offers the four navigation destinations', async () => {
		seedOnboardedStorage();
		await render(AppShellHarness, { props: { body: 'Page body' } });
		for (const label of ['Today', 'Progress', 'Plan', 'You']) {
			await expect.element(page.getByRole('link', { name: label })).toBeInTheDocument();
		}
	});

	// Which destination reads as current depends on real routing, so that is
	// asserted end to end rather than here.

	it('opens the log sheet from the central action', async () => {
		seedOnboardedStorage();
		await render(AppShellHarness, { props: { body: 'Page body' } });
		await page.getByRole('button', { name: 'Log food' }).click();
		expect(logUi.open).toBe(true);
	});
});
