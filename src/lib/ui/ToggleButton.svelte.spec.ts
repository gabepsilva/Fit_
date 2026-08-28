import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ToggleButtonHarness from './ToggleButtonHarness.svelte';

describe('ToggleButton', () => {
	it('renders its label', async () => {
		await render(ToggleButtonHarness, { props: { label: 'Photo', pressed: false } });
		await expect.element(page.getByRole('button', { name: 'Photo' })).toBeInTheDocument();
	});

	it('reports its selected state to assistive technology', async () => {
		await render(ToggleButtonHarness, { props: { label: 'Photo', pressed: true } });
		await expect.element(page.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
	});

	it('reports being unselected too, rather than staying silent', async () => {
		await render(ToggleButtonHarness, { props: { label: 'Photo', pressed: false } });
		await expect.element(page.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
	});

	it('never submits a surrounding form', async () => {
		await render(ToggleButtonHarness, { props: { label: 'Photo', pressed: false } });
		await expect.element(page.getByRole('button')).toHaveAttribute('type', 'button');
	});

	it('keeps the resting look while unselected', async () => {
		await render(ToggleButtonHarness, {
			props: { label: 'Photo', pressed: false, class: 'bg-card text-muted-foreground' }
		});
		await expect.element(page.getByRole('button')).toHaveClass(/bg-card/);
	});

	it('lets the selected tone win over the resting background', async () => {
		await render(ToggleButtonHarness, {
			props: { label: 'Photo', pressed: true, class: 'bg-card text-muted-foreground' }
		});
		const button = page.getByRole('button');
		await expect.element(button).toHaveClass(/bg-primary/);
		await expect.element(button).not.toHaveClass(/bg-card/);
	});

	it('offers an inverted tone for the darker pickers', async () => {
		await render(ToggleButtonHarness, {
			props: { label: 'Lunch', pressed: true, tone: 'inverse', class: 'bg-secondary' }
		});
		await expect.element(page.getByRole('button')).toHaveClass(/bg-foreground/);
	});

	it('keeps sizing classes the tone does not conflict with', async () => {
		await render(ToggleButtonHarness, {
			props: { label: 'Photo', pressed: true, class: 'h-9 rounded-full text-xs' }
		});
		await expect.element(page.getByRole('button')).toHaveClass(/h-9/);
	});

	it('calls back when pressed', async () => {
		const onclick = vi.fn();
		await render(ToggleButtonHarness, { props: { label: 'Photo', pressed: false, onclick } });
		await page.getByRole('button').click();
		expect(onclick).toHaveBeenCalledTimes(1);
	});
});
