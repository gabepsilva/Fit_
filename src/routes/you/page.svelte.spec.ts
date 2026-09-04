import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { emptyProfile } from '$lib/domain/profile';
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
