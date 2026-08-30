import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { SignedInSession } from '$lib/auth/api';
import { session } from '$lib/state/session.svelte';
import SideNav from './SideNav.svelte';

const DESTINATIONS = ['Today', 'Progress', 'Exercise', 'Plan', 'You'];

const SESSION: SignedInSession = {
	account: { id: 'a-1', username: 'robin', displayName: 'Robin', createdAt: '2026-08-01' },
	households: [{ householdId: 'h-1', name: 'Home', role: 'owner' }],
	expiresAt: new Date(Date.now() + 86_400_000).toISOString()
};

beforeEach(() => {
	localStorage.clear();
	session.current = null;
	session.hydrated = false;
});

describe('SideNav', () => {
	it('stays out of the way while closed', async () => {
		await render(SideNav, { props: { open: false, pathname: '/' } });
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it('offers every destination when open', async () => {
		await render(SideNav, { props: { open: true, pathname: '/' } });
		for (const label of DESTINATIONS) {
			await expect.element(page.getByRole('link', { name: label })).toBeInTheDocument();
		}
	});

	it('carries the exercise destination', async () => {
		await render(SideNav, { props: { open: true, pathname: '/' } });
		await expect
			.element(page.getByRole('link', { name: 'Exercise' }))
			.toHaveAttribute('href', '/exercise');
	});

	it('names itself for screen readers', async () => {
		await render(SideNav, { props: { open: true, pathname: '/' } });
		await expect.element(page.getByRole('dialog', { name: 'Fit_' })).toBeInTheDocument();
	});

	it('marks the current destination for assistive technology', async () => {
		await render(SideNav, { props: { open: true, pathname: '/' } });
		await expect
			.element(page.getByRole('link', { name: 'Today' }))
			.toHaveAttribute('aria-current', 'page');
	});

	it('leaves the other destinations unmarked', async () => {
		await render(SideNav, { props: { open: true, pathname: '/' } });
		expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
	});

	it('highlights whichever destination is current', async () => {
		await render(SideNav, { props: { open: true, pathname: '/exercise' } });
		await expect.element(page.getByRole('link', { name: 'Exercise' })).toHaveClass(/text-primary/);
	});

	it('marks nothing current on an unknown path', async () => {
		await render(SideNav, { props: { open: true, pathname: '/nowhere' } });
		expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
	});

	it('moves the current marker when navigation happens', async () => {
		const props = $state({ open: true, pathname: '/' });
		await render(SideNav, { props });
		props.pathname = '/plan';
		await expect
			.element(page.getByRole('link', { name: 'Plan' }))
			.toHaveAttribute('aria-current', 'page');
		expect(document.querySelector('a[href$="/"]')?.getAttribute('aria-current')).toBeNull();
	});

	it('closes from its close control', async () => {
		const props = $state({ open: true, pathname: '/' });
		await render(SideNav, { props });
		await page.getByRole('button', { name: 'Close menu' }).click();
		expect(props.open).toBe(false);
	});

	it('carries the account block, which is where signing out lives', async () => {
		await render(SideNav, { props: { open: true, pathname: '/' } });
		await expect.element(page.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
	});

	it('offers the sign-out to someone who is signed in', async () => {
		session.begin(SESSION);
		await render(SideNav, { props: { open: true, pathname: '/' } });
		await expect
			.element(page.getByRole('button', { name: 'Sign out', exact: true }))
			.toBeInTheDocument();
	});

	it('closes on Escape', async () => {
		const props = $state({ open: true, pathname: '/' });
		await render(SideNav, { props });
		await page.getByRole('dialog').click();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(props.open).toBe(false);
	});
});
