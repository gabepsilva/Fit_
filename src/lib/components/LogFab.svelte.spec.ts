import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import LogFab from './LogFab.svelte';

describe('LogFab', () => {
	it('offers a way to log food', async () => {
		await render(LogFab, { props: { onlog: vi.fn() } });
		await expect.element(page.getByRole('button', { name: 'Log food' })).toBeInTheDocument();
	});

	it('raises the log action', async () => {
		const onlog = vi.fn();
		await render(LogFab, { props: { onlog } });
		await page.getByRole('button', { name: 'Log food' }).click();
		expect(onlog).toHaveBeenCalled();
	});
});
