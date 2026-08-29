import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ExercisePickRow from './ExercisePickRow.svelte';

const BASE = { name: 'Bench Press', note: 'Chest', selected: false };

describe('ExercisePickRow', () => {
	it('shows the movement and what it trains', async () => {
		await render(ExercisePickRow, { props: { ...BASE, onpick: vi.fn() } });
		await expect.element(page.getByText('Bench Press')).toBeInTheDocument();
		await expect.element(page.getByText('Chest')).toBeInTheDocument();
	});

	it('offers an empty checkbox while the movement is unchosen', async () => {
		await render(ExercisePickRow, { props: { ...BASE, onpick: vi.fn() } });
		await expect
			.element(page.getByRole('checkbox', { name: 'Select Bench Press' }))
			.toHaveAttribute('aria-checked', 'false');
	});

	it('shows an already chosen movement as checked', async () => {
		await render(ExercisePickRow, { props: { ...BASE, selected: true, onpick: vi.fn() } });
		await expect
			.element(page.getByRole('checkbox', { name: 'Select Bench Press' }))
			.toHaveAttribute('aria-checked', 'true');
	});

	it('reports a tick on the checkbox to whoever is collecting them', async () => {
		const onpick = vi.fn();
		await render(ExercisePickRow, { props: { ...BASE, onpick } });
		await page.getByRole('checkbox', { name: 'Select Bench Press' }).click();
		expect(onpick).toHaveBeenCalledTimes(1);
	});

	it('offers no form check when there is nothing to play', async () => {
		await render(ExercisePickRow, { props: { ...BASE, onpick: vi.fn() } });
		expect(page.getByRole('button', { name: 'Watch Bench Press' }).elements()).toHaveLength(0);
	});

	it('offers a named form check when one is available', async () => {
		const onplay = vi.fn();
		await render(ExercisePickRow, { props: { ...BASE, onpick: vi.fn(), onplay } });
		await page.getByRole('button', { name: 'Watch Bench Press' }).click();
		expect(onplay).toHaveBeenCalledTimes(1);
	});

	it('keeps the form check apart from the pick', async () => {
		const onpick = vi.fn();
		const onplay = vi.fn();
		await render(ExercisePickRow, { props: { ...BASE, onpick, onplay } });
		await page.getByRole('button', { name: 'Watch Bench Press' }).click();
		expect(onpick).not.toHaveBeenCalled();
		expect(onplay).toHaveBeenCalledTimes(1);
	});
});
