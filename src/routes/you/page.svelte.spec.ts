import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { emptyProfile } from '$lib/domain/profile';
import { heightFromFeetInches, heightToFeetInches } from '$lib/domain/units';
import { tend } from '$lib/state/tend.svelte';
import YouPage from './+page.svelte';

/** Named `page.svelte.spec.ts`, not `+page.svelte.spec.ts`: SvelteKit reserves `+`. */

function onboard() {
	tend.resetAll();
	tend.completeOnboarding({
		profile: emptyProfile({ name: 'Alex' }),
		household: false,
		useSample: false
	});
}

beforeEach(() => {
	localStorage.clear();
	onboard();
});

describe('the Preferences section', () => {
	it('shows metric pressed by default', async () => {
		await render(YouPage);
		await expect
			.element(page.getByRole('button', { name: 'Metric' }))
			.toHaveAttribute('aria-pressed', 'true');
		await expect
			.element(page.getByRole('button', { name: 'Imperial' }))
			.toHaveAttribute('aria-pressed', 'false');
	});

	it('switches the units preference immediately, no reload', async () => {
		await render(YouPage);
		await page.getByRole('button', { name: 'Imperial' }).click();
		expect(tend.state.units).toBe('imperial');
		await expect
			.element(page.getByRole('button', { name: 'Imperial' }))
			.toHaveAttribute('aria-pressed', 'true');
	});

	it('keeps the load unit control separate from the units preference', async () => {
		await render(YouPage);
		await page.getByRole('button', { name: 'Imperial' }).click();
		expect(tend.state.loadUnit).toBe('kg');
	});

	it('steps the rest length rather than taking a typed value directly', async () => {
		await render(YouPage);
		await page.getByRole('button', { name: 'Increase rest between sets' }).click();
		expect(tend.state.restSeconds).toBe(105);
	});
});

describe('the Height field', () => {
	it('shows the onboarded height in centimeters under the metric preference', async () => {
		await render(YouPage);
		await expect.element(page.getByLabelText('Height in centimeters')).toHaveValue('168');
	});

	it('shows the onboarded height as feet and inches under the imperial preference', async () => {
		tend.state.units = 'imperial';
		await render(YouPage);
		await expect.element(page.getByLabelText('Height, feet')).toBeInTheDocument();
		await expect.element(page.getByLabelText('Height, inches')).toBeInTheDocument();
	});

	it('saves an edited height onto the active profile', async () => {
		await render(YouPage);
		await page.getByLabelText('Height in centimeters').fill('180');
		await page.getByRole('button', { name: 'Save height' }).click();
		expect(tend.profile?.heightCm).toBe(180);
	});

	it('does not save a blank height', async () => {
		await render(YouPage);
		await page.getByLabelText('Height in centimeters').fill('');
		await page.getByRole('button', { name: 'Save height' }).click();
		expect(tend.profile?.heightCm).toBe(168);
	});

	it('saves the exact canonical cm for typed feet and inches, not a rounded display value', async () => {
		tend.state.units = 'imperial';
		await render(YouPage);
		await page.getByLabelText('Height, feet').fill('5');
		await page.getByLabelText('Height, inches').fill('9');
		await page.getByRole('button', { name: 'Save height' }).click();
		expect(tend.profile?.heightCm).toBe(heightFromFeetInches(5, 9));
	});

	it('round-trips the stored height through imperial and back with no drift', async () => {
		// 175 cm is not an exact number of inches: reading it as feet + inches
		// rounds to the nearest inch for display. Only entering a new value
		// (not merely switching the units toggle) may change the stored cm.
		tend.patchActive((p) => ({ ...p, heightCm: 175 }));
		await render(YouPage);
		await expect.element(page.getByLabelText('Height in centimeters')).toHaveValue('175');

		await page.getByRole('button', { name: 'Imperial' }).click();
		const { feet, inches } = heightToFeetInches(175);
		await expect.element(page.getByLabelText('Height, feet')).toHaveValue(String(feet));
		await expect.element(page.getByLabelText('Height, inches')).toHaveValue(String(inches));

		await page.getByRole('button', { name: 'Metric' }).click();
		// Still exactly 175 cm — the imperial display never wrote its rounded reading back.
		await expect.element(page.getByLabelText('Height in centimeters')).toHaveValue('175');
		expect(tend.profile?.heightCm).toBe(175);
	});
});

describe('the Privacy section', () => {
	it('does not claim logs stay only on the device now that they sync', async () => {
		// Regression: this used to say "Nothing is sent anywhere — there is no
		// server yet", which became false once /api/state started syncing logs.
		await render(YouPage);
		const privacy = document.body.querySelector('ul');
		const text = privacy?.textContent ?? '';
		expect(text).not.toMatch(/nothing is sent anywhere/i);
		expect(text).not.toMatch(/no server/i);
	});

	it('says the logs sync to the server for the account', async () => {
		await render(YouPage);
		await expect.element(page.getByText(/sync to the server/i)).toBeInTheDocument();
	});
});
