import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { emptyProfile } from '$lib/domain/profile';
import { logUi } from '$lib/state/log-ui.svelte';
import { session, SESSION_STORAGE_KEY } from '$lib/state/session.svelte';
import { STORAGE_KEY, tend } from '$lib/state/tend.svelte';
import AppShellHarness from './AppShellHarness.svelte';

/** Put a completed onboarding into storage, the way a returning visit would find it. */
function seedOnboardedStorage() {
	const store = { onboarded: true, activeProfileId: 'p1', profiles: [], weekPlan: [], pantry: [] };
	store.profiles = [{ ...emptyProfile({ name: 'Alex' }), id: 'p1' }] as never;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/** A session record of the shape signing in leaves behind, still in date. */
function seedSessionStorage() {
	const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
	localStorage.setItem(
		SESSION_STORAGE_KEY,
		JSON.stringify({
			account: { id: 'a-1', username: 'robin', displayName: 'Robin', createdAt: '2026-08-01' },
			households: [{ householdId: 'h-1', name: 'Home', role: 'owner' }],
			expiresAt
		})
	);
}

/** The shell must not reach a real endpoint from a test, signed in or not. */
function stubFetch() {
	return vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(() => Promise.resolve(new Response(null, { status: 401 })));
}

beforeEach(() => {
	localStorage.clear();
	logUi.open = false;
	logUi.tab = 'type';
	tend.resetAll();
	tend.hydrated = false;
	// The session store is a module singleton, so a previous render's hydration
	// would otherwise make this one a no-op.
	session.current = null;
	session.hydrated = false;
});

afterEach(() => {
	vi.restoreAllMocks();
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

	it('reconciles a restored session against the server it was issued by', async () => {
		// The record is what signing in answered, and the session behind it may
		// have been revoked from another device since. Only the server knows.
		seedOnboardedStorage();
		seedSessionStorage();
		const fetched = stubFetch();
		await render(AppShellHarness, { props: { body: 'Page body' } });
		await vi.waitFor(() => expect(fetched).toHaveBeenCalled());
		expect(fetched).toHaveBeenCalledWith('/api/sessions/current', { method: 'GET' });
	});

	it('asks nothing on behalf of a device that was never signed in', async () => {
		seedOnboardedStorage();
		const fetched = stubFetch();
		await render(AppShellHarness, { props: { body: 'Page body' } });
		await expect.element(page.getByText('Page body')).toBeInTheDocument();
		expect(fetched).not.toHaveBeenCalled();
	});
});
