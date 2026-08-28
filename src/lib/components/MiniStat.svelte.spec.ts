import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import MiniStat from './MiniStat.svelte';

describe('MiniStat', () => {
	it('shows the label', async () => {
		await render(MiniStat, { props: { label: 'Protein', value: 50, target: 120, unit: 'g' } });
		await expect.element(page.getByText('Protein')).toBeInTheDocument();
	});

	it('shows progress against the target', async () => {
		await render(MiniStat, { props: { label: 'Protein', value: 50.4, target: 120, unit: 'g' } });
		await expect.element(page.getByText('50/120 g')).toBeInTheDocument();
	});

	it('caps the bar at the target rather than overflowing', async () => {
		await render(MiniStat, {
			props: { label: 'Protein', value: 500, target: 100, unit: 'g' }
		});
		expect(document.body.querySelector<HTMLElement>('.bg-primary')?.style.width).toBe('100%');
	});

	it('shows an empty bar when nothing has been logged', async () => {
		await render(MiniStat, { props: { label: 'Protein', value: 0, target: 120, unit: 'g' } });
		expect(document.body.querySelector<HTMLElement>('.bg-primary')?.style.width).toBe('0%');
	});

	it('shows a partial bar part-way to the target', async () => {
		await render(MiniStat, { props: { label: 'Protein', value: 60, target: 120, unit: 'g' } });
		expect(document.body.querySelector<HTMLElement>('.bg-primary')?.style.width).toBe('50%');
	});

	it('shows an empty bar for a zero target rather than dividing by zero', async () => {
		await render(MiniStat, {
			props: { label: 'Protein', value: 50, target: 0, unit: 'g' }
		});
		expect(document.body.querySelector<HTMLElement>('.bg-primary')?.style.width).toBe('0%');
	});

	it('moves the bar when the value changes', async () => {
		const props = $state({ label: 'Protein', value: 0, target: 120, unit: 'g' });
		await render(MiniStat, { props });
		props.value = 60;
		await expect.element(page.getByText('60/120 g')).toBeInTheDocument();
		expect(document.body.querySelector<HTMLElement>('.bg-primary')?.style.width).toBe('50%');
	});
});
