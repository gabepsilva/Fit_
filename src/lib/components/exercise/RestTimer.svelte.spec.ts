import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import RestTimer from './RestTimer.svelte';

describe('RestTimer', () => {
	it('waits at the full rest before any set is ticked', async () => {
		await render(RestTimer, { props: {} });
		await expect.element(page.getByText('1:30')).toBeInTheDocument();
		await expect.element(page.getByText('Paused')).toBeInTheDocument();
	});

	it('takes the rest length from the caller', async () => {
		await render(RestTimer, { props: { seconds: 60 } });
		await expect.element(page.getByText('1:00')).toBeInTheDocument();
	});

	it('counts down from the moment a set was ticked', async () => {
		await render(RestTimer, { props: { startedAt: Date.now() - 30_000 } });
		await expect.element(page.getByText('Resting')).toBeInTheDocument();
		await expect.element(page.getByText('1:00')).toBeInTheDocument();
	});

	it('says so once the rest has run out', async () => {
		await render(RestTimer, { props: { startedAt: Date.now() - 95_000 } });
		await expect.element(page.getByText('Rest over — go again')).toBeInTheDocument();
		await expect.element(page.getByText('0:00')).toBeInTheDocument();
	});

	it('starts on the play control when no set has been ticked', async () => {
		await render(RestTimer, { props: {} });
		await page.getByRole('button', { name: 'Start rest' }).click();
		await expect.element(page.getByText('Resting')).toBeInTheDocument();
	});

	it('holds the reading where it was when paused', async () => {
		await render(RestTimer, { props: { startedAt: Date.now() - 30_000 } });
		await page.getByRole('button', { name: 'Pause rest' }).click();
		await expect.element(page.getByText('Paused')).toBeInTheDocument();
		await expect.element(page.getByText('1:00')).toBeInTheDocument();
	});

	it('starts a fresh rest again once the last one ran out', async () => {
		await render(RestTimer, { props: { startedAt: Date.now() - 95_000 } });
		await page.getByRole('button', { name: 'Start rest' }).click();
		await expect.element(page.getByText('1:30')).toBeInTheDocument();
	});

	// Real time on purpose: the reading is against the wall clock, and the wait stays under three seconds.
	it('resumes what the pause was holding, even after outlasting the rest', async () => {
		await render(RestTimer, { props: { startedAt: Date.now() - 1000, seconds: 3 } });
		await page.getByRole('button', { name: 'Pause rest' }).click();
		await expect.element(page.getByText('0:02')).toBeInTheDocument();
		await new Promise((resolve) => setTimeout(resolve, 2500));
		await page.getByRole('button', { name: 'Start rest' }).click();
		await expect.element(page.getByText('Resting')).toBeInTheDocument();
		// Read once, not retried: a wrong restart at full length would tick through this reading and pass anyway.
		expect(page.getByText('0:03').elements()).toHaveLength(0);
		expect(page.getByText('0:02').elements()).toHaveLength(1);
	});

	it('lets a newly ticked set overrule a pause', async () => {
		const props = $state({ startedAt: Date.now() - 30_000 });
		await render(RestTimer, { props });
		await page.getByRole('button', { name: 'Pause rest' }).click();
		props.startedAt = Date.now();
		await expect.element(page.getByText('Resting')).toBeInTheDocument();
		await expect.element(page.getByText('1:30')).toBeInTheDocument();
	});
});
