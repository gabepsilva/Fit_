import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Home from '@lucide/svelte/icons/house';
import NavLink from './NavLink.svelte';
import type { NavRoute } from './nav-routes';

const base = { route: '/progress' as const, label: 'Progress', icon: Home };

describe('NavLink', () => {
	it('links to its destination', async () => {
		await render(NavLink, { props: { ...base, active: false } });
		await expect
			.element(page.getByRole('link', { name: 'Progress' }))
			.toHaveAttribute('href', '/progress');
	});

	it('marks itself current when active', async () => {
		await render(NavLink, { props: { ...base, active: true } });
		await expect.element(page.getByRole('link')).toHaveAttribute('aria-current', 'page');
	});

	it('leaves itself unmarked when inactive', async () => {
		await render(NavLink, { props: { ...base, active: false } });
		expect(document.querySelector('a')?.getAttribute('aria-current')).toBeNull();
	});

	it('highlights itself when active', async () => {
		await render(NavLink, { props: { ...base, active: true } });
		await expect.element(page.getByRole('link')).toHaveClass(/text-primary/);
	});

	it('sits on a filled row when active', async () => {
		await render(NavLink, { props: { ...base, active: true } });
		await expect.element(page.getByRole('link')).toHaveClass(/bg-accent/);
	});

	it('stays quiet when inactive', async () => {
		await render(NavLink, { props: { ...base, active: false } });
		await expect.element(page.getByRole('link')).toHaveClass(/text-muted-foreground/);
	});

	it('follows a change in active state', async () => {
		const props = $state({ ...base, active: false });
		await render(NavLink, { props });
		props.active = true;
		await expect.element(page.getByRole('link')).toHaveAttribute('aria-current', 'page');
	});

	it('follows a change of destination', async () => {
		const props: { route: NavRoute; label: string; icon: typeof Home; active: boolean } = $state({
			...base,
			active: false
		});
		await render(NavLink, { props });
		props.route = '/exercise';
		props.label = 'Exercise';
		await expect.element(page.getByRole('link', { name: 'Exercise' })).toBeInTheDocument();
	});
});
