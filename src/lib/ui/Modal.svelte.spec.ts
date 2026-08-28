import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ModalHarness from './ModalHarness.svelte';

describe('Modal', () => {
	it('shows nothing while closed', async () => {
		await render(ModalHarness, { props: { open: false, body: 'Modal body' } });
		expect(document.body.textContent).not.toContain('Modal body');
	});

	it('shows its title when open', async () => {
		await render(ModalHarness, { props: { open: true, body: 'Modal body' } });
		await expect.element(page.getByText('Delete this journal?')).toBeInTheDocument();
	});

	it('shows its content when open', async () => {
		await render(ModalHarness, { props: { open: true, body: 'Modal body' } });
		await expect.element(page.getByText('Modal body')).toBeInTheDocument();
	});

	it('shows its description when given one', async () => {
		await render(ModalHarness, {
			props: { open: true, body: 'Modal body', description: 'No undo' }
		});
		expect(document.body.textContent).toContain('No undo');
	});

	it('offers a labelled close control', async () => {
		await render(ModalHarness, { props: { open: true, body: 'Modal body' } });
		await expect.element(page.getByRole('button', { name: 'Close' })).toBeInTheDocument();
	});

	it('closes when the close control is used', async () => {
		const props = $state({ open: true, body: 'Modal body' });
		await render(ModalHarness, { props });
		await page.getByRole('button', { name: 'Close' }).click();
		expect(props.open).toBe(false);
	});
});
