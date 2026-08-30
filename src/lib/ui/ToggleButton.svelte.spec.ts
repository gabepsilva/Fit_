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
			props: { label: 'Photo', pressed: false, resting: 'bg-card text-muted-foreground' }
		});
		await expect.element(page.getByRole('button')).toHaveClass(/bg-card/);
	});

	// The resting palette has to leave the element, not merely lose to the tone in
	// the stylesheet. Nothing resolves conflicting utilities any more, so a
	// resting background left in place would be decided by Tailwind's own class
	// order rather than by which state the button is in.
	it('replaces the resting palette with the selected tone', async () => {
		await render(ToggleButtonHarness, {
			props: { label: 'Photo', pressed: true, resting: 'bg-card text-muted-foreground' }
		});
		const button = page.getByRole('button');
		await expect.element(button).toHaveClass(/bg-primary/);
		await expect.element(button).not.toHaveClass(/bg-card/);
	});

	it('offers an inverted tone for the darker pickers', async () => {
		await render(ToggleButtonHarness, {
			props: { label: 'Lunch', pressed: true, tone: 'inverse', resting: 'bg-secondary' }
		});
		const button = page.getByRole('button');
		await expect.element(button).toHaveClass(/bg-foreground/);
		await expect.element(button).not.toHaveClass(/bg-secondary/);
	});

	it('keeps the shape both states share, whichever one is showing', async () => {
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
