import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { ROUTINE_TEMPLATES } from '$lib/domain/exercise-catalog';
import FirstRunTemplates from './FirstRunTemplates.svelte';

const noop = () => {};

describe('FirstRunTemplates', () => {
	it('opens on the absence rather than on an empty list', async () => {
		await render(FirstRunTemplates, { props: { onpick: noop, onopen: noop } });
		await expect
			.element(page.getByRole('heading', { name: 'Nothing here yet', level: 1 }))
			.toBeInTheDocument();
	});

	it('says a template can be changed afterwards', async () => {
		await render(FirstRunTemplates, { props: { onpick: noop, onopen: noop } });
		await expect
			.element(page.getByText(/You can change every exercise, set and rep/))
			.toBeInTheDocument();
	});

	it('offers every starter routine', async () => {
		await render(FirstRunTemplates, { props: { onpick: noop, onopen: noop } });
		for (const template of ROUTINE_TEMPLATES) {
			await expect.element(page.getByText(template.name)).toBeInTheDocument();
		}
	});

	it('says how often a template trains, and what it is', async () => {
		await render(FirstRunTemplates, { props: { onpick: noop, onopen: noop } });
		await expect.element(page.getByText('Four days a week')).toBeInTheDocument();
		await expect.element(page.getByText('4×')).toBeInTheDocument();
		await expect
			.element(page.getByText(/Two upper-body days and two lower-body days/))
			.toBeInTheDocument();
	});

	it('picks the template that was tapped', async () => {
		const onpick = vi.fn();
		await render(FirstRunTemplates, { props: { onpick, onopen: noop } });
		await page.getByRole('button', { name: /Upper \/ Lower/ }).click();
		expect(onpick).toHaveBeenCalledWith('ul');
	});

	it('leaves a way past the templates entirely', async () => {
		const onopen = vi.fn();
		await render(FirstRunTemplates, { props: { onpick: noop, onopen } });
		await page.getByRole('button', { name: 'Build one from scratch' }).click();
		expect(onopen).toHaveBeenCalledTimes(1);
	});
});
