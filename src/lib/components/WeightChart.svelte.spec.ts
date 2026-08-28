import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { WeightEntry } from '$lib/domain/types';
import WeightChart from './WeightChart.svelte';

function readings(kgs: number[]): WeightEntry[] {
	return kgs.map((kg, i) => ({ id: `w${i}`, date: `2026-06-0${i + 1}`, kg }));
}

describe('WeightChart', () => {
	it('invites a first weigh-in when there is no data', async () => {
		await render(WeightChart, { props: { weights: [] } });
		await expect.element(page.getByText(/Log a few weigh-ins/)).toBeInTheDocument();
	});

	it('still invites one when there is only a single reading to plot', async () => {
		await render(WeightChart, { props: { weights: readings([80]) } });
		await expect.element(page.getByText(/Log a few weigh-ins/)).toBeInTheDocument();
	});

	it('draws a line once there are two readings', async () => {
		await render(WeightChart, { props: { weights: readings([80, 79]) } });
		expect(document.querySelector('path')?.getAttribute('d')).toMatch(/^M/);
	});

	it('describes the trend for screen readers', async () => {
		await render(WeightChart, { props: { weights: readings([80, 79]) } });
		expect(document.querySelector('svg')?.getAttribute('aria-label')).toMatch(/80 to 79/);
	});

	it('plots one point per reading', async () => {
		await render(WeightChart, { props: { weights: readings([80, 79.5, 79]) } });
		expect(document.querySelector('path')?.getAttribute('d')?.match(/[ML]/g)).toHaveLength(3);
	});

	it('sorts readings by date regardless of input order', async () => {
		const unsorted: WeightEntry[] = [
			{ id: 'b', date: '2026-06-05', kg: 79 },
			{ id: 'a', date: '2026-06-01', kg: 81 }
		];
		await render(WeightChart, { props: { weights: unsorted } });
		expect(document.querySelector('svg')?.getAttribute('aria-label')).toMatch(/81 to 79/);
	});

	it('does not collapse the plot when every reading is identical', async () => {
		await render(WeightChart, { props: { weights: readings([80, 80, 80]) } });
		expect(document.querySelector('path')?.getAttribute('d')).toBeTruthy();
	});
});
