import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import AvgRow from './AvgRow.svelte';

describe('AvgRow', () => {
	it('shows the value against the target', async () => {
		await render(AvgRow, { props: { label: 'Fiber', value: 21.44, target: 28, unit: 'g' } });
		await expect.element(page.getByText('21.4 / 28 g')).toBeInTheDocument();
	});

	it('notes when a nutrient is running light', async () => {
		await render(AvgRow, { props: { label: 'Fiber', value: 5, target: 28, unit: 'g' } });
		await expect.element(page.getByText(/a little light/)).toBeInTheDocument();
	});

	it('stays silent when a nutrient is comfortably on track', async () => {
		await render(AvgRow, {
			props: { label: 'Fiber', value: 27, target: 28, unit: 'g' }
		});
		expect(document.body.textContent).not.toContain('a little');
	});

	it('notes when an inverted nutrient runs high, not light', async () => {
		await render(AvgRow, {
			props: { label: 'Sodium', value: 3000, target: 2300, unit: 'mg', invert: true }
		});
		await expect.element(page.getByText(/a little high/)).toBeInTheDocument();
	});

	it('stays silent when an inverted nutrient is under its ceiling', async () => {
		await render(AvgRow, {
			props: { label: 'Sodium', value: 100, target: 2300, unit: 'mg', invert: true }
		});
		expect(document.body.textContent).not.toContain('a little');
	});

	it('shows a partial bar part-way to the target', async () => {
		await render(AvgRow, { props: { label: 'Fiber', value: 14, target: 28, unit: 'g' } });
		expect(document.body.querySelector<HTMLElement>('.bg-primary')?.style.width).toBe('50%');
	});

	it('caps the bar at the target', async () => {
		await render(AvgRow, { props: { label: 'Fiber', value: 90, target: 28, unit: 'g' } });
		expect(document.body.querySelector<HTMLElement>('.bg-primary')?.style.width).toBe('100%');
	});

	it('shows an empty bar for a zero target', async () => {
		await render(AvgRow, {
			props: { label: 'Fiber', value: 5, target: 0, unit: 'g' }
		});
		expect(document.body.querySelector<HTMLElement>('.bg-primary')?.style.width).toBe('0%');
	});

	it('moves the bar when the average changes', async () => {
		const props = $state({ label: 'Fiber', value: 0, target: 28, unit: 'g' });
		await render(AvgRow, { props });
		props.value = 14;
		await expect.element(page.getByText('14 / 28 g')).toBeInTheDocument();
		expect(document.body.querySelector<HTMLElement>('.bg-primary')?.style.width).toBe('50%');
	});
});
