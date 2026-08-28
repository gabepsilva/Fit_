import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Switch from './Switch.svelte';

describe('Switch', () => {
	it('is off by default', async () => {
		await render(Switch, { props: { 'aria-label': 'GLP-1 mode' } });
		await expect
			.element(page.getByRole('switch', { name: 'GLP-1 mode' }))
			.toHaveAttribute('data-state', 'unchecked');
	});

	it('reflects an on state', async () => {
		await render(Switch, { props: { checked: true, 'aria-label': 'GLP-1 mode' } });
		await expect
			.element(page.getByRole('switch', { name: 'GLP-1 mode' }))
			.toHaveAttribute('data-state', 'checked');
	});

	it('writes a toggle back to the caller', async () => {
		const props = $state({ checked: false, 'aria-label': 'GLP-1 mode' });
		await render(Switch, { props });
		await page.getByRole('switch', { name: 'GLP-1 mode' }).click();
		expect(props.checked).toBe(true);
	});

	it('toggles back off', async () => {
		const props = $state({ checked: true, 'aria-label': 'GLP-1 mode' });
		await render(Switch, { props });
		await page.getByRole('switch', { name: 'GLP-1 mode' }).click();
		expect(props.checked).toBe(false);
	});
});
