import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import SheetHarness from './SheetHarness.svelte';

describe('Sheet', () => {
	it('shows nothing while closed', async () => {
		await render(SheetHarness, { props: { open: false, body: 'Sheet body' } });
		expect(document.body.textContent).not.toContain('Sheet body');
	});

	it('shows its content when open', async () => {
		await render(SheetHarness, { props: { open: true, body: 'Sheet body' } });
		await expect.element(page.getByText('Sheet body')).toBeInTheDocument();
	});

	it('names itself for screen readers', async () => {
		await render(SheetHarness, { props: { open: true, body: 'Sheet body' } });
		await expect.element(page.getByRole('dialog', { name: 'Log' })).toBeInTheDocument();
	});

	it('describes itself when given a description', async () => {
		await render(SheetHarness, {
			props: { open: true, body: 'Sheet body', description: 'How it works' }
		});
		expect(document.body.textContent).toContain('How it works');
	});

	it('offers no close control unless one is wanted', async () => {
		await render(SheetHarness, { props: { open: true, body: 'Sheet body' } });
		expect(document.querySelector('[aria-label="Close"]')).toBeNull();
	});

	it('closes from the close control when one is provided', async () => {
		const props = $state({ open: true, body: 'Sheet body', closable: true });
		await render(SheetHarness, { props });
		await page.getByRole('button', { name: 'Close' }).click();
		expect(props.open).toBe(false);
	});

	it('closes on Escape', async () => {
		const props = $state({ open: true, body: 'Sheet body' });
		await render(SheetHarness, { props });
		await page.getByRole('dialog').click();
		await userEscape();
		expect(props.open).toBe(false);
	});
});

async function userEscape() {
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	await new Promise((resolve) => setTimeout(resolve, 50));
}
