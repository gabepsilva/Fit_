import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import BottomNav from './BottomNav.svelte';

describe('BottomNav', () => {
	it('offers the four destinations', async () => {
		await render(BottomNav, { props: { pathname: '/', onlog: vi.fn() } });
		for (const label of ['Today', 'Progress', 'Plan', 'You']) {
			await expect.element(page.getByRole('link', { name: label })).toBeInTheDocument();
		}
	});

	it('marks the current destination for assistive technology', async () => {
		await render(BottomNav, { props: { pathname: '/', onlog: vi.fn() } });
		await expect
			.element(page.getByRole('link', { name: 'Today' }))
			.toHaveAttribute('aria-current', 'page');
	});

	it('leaves the other destinations unmarked', async () => {
		await render(BottomNav, { props: { pathname: '/', onlog: vi.fn() } });
		const progress = document.querySelector('a[href$="/progress"]');
		expect(progress?.getAttribute('aria-current')).toBeNull();
	});

	it('highlights whichever destination is current', async () => {
		await render(BottomNav, { props: { pathname: '/plan', onlog: vi.fn() } });
		await expect
			.element(page.getByRole('link', { name: 'Plan' }))
			.toHaveAttribute('aria-current', 'page');
	});

	it('styles the current destination distinctly', async () => {
		await render(BottomNav, { props: { pathname: '/you', onlog: vi.fn() } });
		await expect.element(page.getByRole('link', { name: 'You' })).toHaveClass(/text-primary/);
	});

	it('marks nothing current on an unknown path', async () => {
		await render(BottomNav, { props: { pathname: '/nowhere', onlog: vi.fn() } });
		expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
	});

	it('raises the log action', async () => {
		const onlog = vi.fn();
		await render(BottomNav, { props: { pathname: '/', onlog } });
		await page.getByRole('button', { name: 'Log food' }).click();
		expect(onlog).toHaveBeenCalled();
	});

	it('moves the current marker when navigation happens', async () => {
		const props = $state({ pathname: '/', onlog: vi.fn() });
		await render(BottomNav, { props });
		props.pathname = '/progress';
		await expect
			.element(page.getByRole('link', { name: 'Progress' }))
			.toHaveAttribute('aria-current', 'page');
		expect(document.querySelector('a[href$="/"]')?.getAttribute('aria-current')).toBeNull();
	});
});
