import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { emptyProfile } from '$lib/domain/profile';
import { lbToKg } from '$lib/domain/units';
import { tend } from '$lib/state/tend.svelte';
import ProgressPage from './+page.svelte';

/** Named `page.svelte.spec.ts`, not `+page.svelte.spec.ts`: SvelteKit reserves `+`. */

function onboard() {
	tend.resetAll();
	tend.completeOnboarding({
		profile: {
			...emptyProfile({ name: 'Alex' }),
			weights: [{ id: 'w1', date: '2026-06-01', kg: 74.3 }]
		},
		household: false,
		useSample: false
	});
}

beforeEach(() => {
	localStorage.clear();
	onboard();
});

describe('the weight preference on Progress', () => {
	it('reads metric by default', async () => {
		await render(ProgressPage);
		await expect.element(page.getByText('74.3')).toBeInTheDocument();
	});

	it('reads the same stored weight in pounds once the preference is imperial, unrounded to display precision', async () => {
		tend.setUnits('imperial');
		await render(ProgressPage);
		// 74.3 kg -> 163.8 lb, not the stored kg reading.
		await expect.element(page.getByText('163.8')).toBeInTheDocument();
		expect(tend.profile?.weights[0]?.kg).toBe(74.3);
	});

	it('changes nothing stored when the preference changes, only what is displayed', async () => {
		await render(ProgressPage);
		const before = JSON.stringify(tend.profile?.weights);
		tend.setUnits('imperial');
		tend.setUnits('metric');
		expect(JSON.stringify(tend.profile?.weights)).toBe(before);
	});

	it('stores a weight typed in pounds as the exact equivalent kilograms', async () => {
		tend.setUnits('imperial');
		await render(ProgressPage);
		await page.getByLabelText('Today’s weight in pounds').fill('160');
		await page.getByRole('button', { name: 'Save' }).click();
		const latest = tend.profile?.weights.at(-1);
		expect(latest?.kg).toBe(lbToKg(160));
	});

	it('stores a weight typed in kilograms unchanged', async () => {
		await render(ProgressPage);
		await page.getByLabelText('Today’s weight in kilograms').fill('82');
		await page.getByRole('button', { name: 'Save' }).click();
		const latest = tend.profile?.weights.at(-1);
		expect(latest?.kg).toBe(82);
	});
});
