import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import TopBar from './TopBar.svelte';

const base = { menuOpen: false, onmenu: vi.fn(), onphoto: vi.fn(), onlog: vi.fn() };

describe('TopBar', () => {
	it('offers a way into the menu', async () => {
		await render(TopBar, { props: { ...base } });
		await expect.element(page.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
	});

	it('raises the menu action', async () => {
		const onmenu = vi.fn();
		await render(TopBar, { props: { ...base, onmenu } });
		await page.getByRole('button', { name: 'Open menu' }).click();
		expect(onmenu).toHaveBeenCalled();
	});

	it('offers a camera as its own way to log', async () => {
		await render(TopBar, { props: { ...base } });
		await expect
			.element(page.getByRole('button', { name: 'Log from a photo' }))
			.toBeInTheDocument();
	});

	it('raises the photo action', async () => {
		const onphoto = vi.fn();
		await render(TopBar, { props: { ...base, onphoto } });
		await page.getByRole('button', { name: 'Log from a photo' }).click();
		expect(onphoto).toHaveBeenCalled();
	});

	it('keeps the camera separate from the general log action', async () => {
		const onlog = vi.fn();
		await render(TopBar, { props: { ...base, onlog } });
		await page.getByRole('button', { name: 'Log from a photo' }).click();
		expect(onlog).not.toHaveBeenCalled();
	});

	it('raises the log action', async () => {
		const onlog = vi.fn();
		await render(TopBar, { props: { ...base, onlog } });
		await page.getByRole('button', { name: 'Log food' }).click();
		expect(onlog).toHaveBeenCalled();
	});

	it('reports the menu as shut while it is', async () => {
		await render(TopBar, { props: { ...base } });
		await expect
			.element(page.getByRole('button', { name: 'Open menu' }))
			.toHaveAttribute('aria-expanded', 'false');
	});

	it('reports the menu as open once it is', async () => {
		const props = $state({ ...base, menuOpen: false });
		await render(TopBar, { props });
		props.menuOpen = true;
		await expect
			.element(page.getByRole('button', { name: 'Open menu' }))
			.toHaveAttribute('aria-expanded', 'true');
	});

	it('announces that the menu is a dialog', async () => {
		await render(TopBar, { props: { ...base } });
		await expect
			.element(page.getByRole('button', { name: 'Open menu' }))
			.toHaveAttribute('aria-haspopup', 'dialog');
	});
});
