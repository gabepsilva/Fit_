import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import InitialSync from './InitialSync.svelte';

describe('InitialSync', () => {
	it('tells a person their data is on its way, rather than showing nothing', async () => {
		await render(InitialSync);
		await expect.element(page.getByText('Loading your data…')).toBeInTheDocument();
	});

	it('announces itself to assistive tech as a status, not silently', async () => {
		await render(InitialSync);
		await expect.element(page.getByRole('status')).toBeInTheDocument();
	});
});
