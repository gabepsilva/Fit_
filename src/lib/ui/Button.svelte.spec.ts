import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Button from './Button.svelte';
import ButtonHarness from './ButtonHarness.svelte';

describe('Button', () => {
	it('renders its content', async () => {
		await render(ButtonHarness, { props: { label: 'Log something' } });
		await expect.element(page.getByRole('button', { name: 'Log something' })).toBeInTheDocument();
	});

	it('calls the click handler', async () => {
		const onclick = vi.fn();
		await render(ButtonHarness, { props: { label: 'Save', onclick } });
		await page.getByRole('button', { name: 'Save' }).click();
		expect(onclick).toHaveBeenCalled();
	});

	it('does not fire when disabled', async () => {
		const onclick = vi.fn();
		await render(ButtonHarness, { props: { label: 'Save', onclick, disabled: true } });
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
		expect(onclick).not.toHaveBeenCalled();
	});

	it('applies the variant classes', async () => {
		await render(ButtonHarness, { props: { label: 'Quiet', variant: 'quiet' } });
		await expect.element(page.getByRole('button')).toHaveClass(/bg-transparent/);
	});

	it('applies the size classes', async () => {
		await render(ButtonHarness, { props: { label: 'Big', size: 'lg' } });
		await expect.element(page.getByRole('button')).toHaveClass(/h-12/);
	});

	it('merges a caller-supplied class', async () => {
		await render(ButtonHarness, { props: { label: 'Wide', class: 'w-full' } });
		await expect.element(page.getByRole('button')).toHaveClass(/w-full/);
	});

	it('is exported as a component', () => {
		expect(Button).toBeTypeOf('function');
	});
});
