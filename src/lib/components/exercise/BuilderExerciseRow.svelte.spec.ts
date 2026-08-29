import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { RoutineExercise } from '$lib/domain/types';
import BuilderExerciseRow from './BuilderExerciseRow.svelte';

const SQUAT: RoutineExercise = { name: 'Squat', group: 'Legs', sets: 4, reps: 6, load: 80 };

async function renderRow(index = 1, exercise: RoutineExercise = SQUAT) {
	const handlers = { onmoveup: vi.fn(), onremove: vi.fn(), onbump: vi.fn() };
	await render(BuilderExerciseRow, { props: { index, exercise, ...handlers } });
	return handlers;
}

describe('BuilderExerciseRow', () => {
	it('numbers the movement by its place in the routine', async () => {
		await renderRow();
		await expect.element(page.getByText('2')).toBeInTheDocument();
	});

	it('names the movement and the muscle it trains', async () => {
		await renderRow();
		await expect.element(page.getByText('Squat')).toBeInTheDocument();
		await expect.element(page.getByText('Legs')).toBeInTheDocument();
	});

	it('leaves loads to the sheet', async () => {
		await renderRow();
		expect(document.body.textContent).not.toContain('80');
	});

	it('moves the movement one place up', async () => {
		const { onmoveup } = await renderRow();
		await page.getByRole('button', { name: 'Move Squat up' }).click();
		expect(onmoveup).toHaveBeenCalledTimes(1);
	});

	it('has nowhere to move the first movement', async () => {
		await renderRow(0);
		await expect.element(page.getByRole('button', { name: 'Move Squat up' })).toBeDisabled();
	});

	it('removes the movement', async () => {
		const { onremove } = await renderRow();
		await page.getByRole('button', { name: 'Remove Squat' }).click();
		expect(onremove).toHaveBeenCalledTimes(1);
	});

	it('follows the movement when the routine is reordered under it', async () => {
		const props = $state({
			index: 1,
			exercise: SQUAT,
			onmoveup: vi.fn(),
			onremove: vi.fn(),
			onbump: vi.fn()
		});
		await render(BuilderExerciseRow, { props });
		props.exercise = { name: 'Leg Press', group: 'Legs', sets: 3, reps: 8, load: 0 };
		props.index = 0;
		await expect.element(page.getByText('Leg Press')).toBeInTheDocument();
		await expect.element(page.getByText('1')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Move Leg Press up' })).toBeDisabled();
	});

	it('steps sets and reps separately', async () => {
		const { onbump } = await renderRow();
		await page.getByRole('button', { name: 'Increase Squat sets' }).click();
		await page.getByRole('button', { name: 'Decrease Squat reps' }).click();
		expect(onbump.mock.calls).toEqual([
			['sets', 1],
			['reps', -1]
		]);
	});
});
