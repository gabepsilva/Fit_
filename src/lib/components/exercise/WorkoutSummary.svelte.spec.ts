import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { Routine, Workout } from '$lib/domain/types';
import { todayISO } from '$lib/domain/utils';
import { workoutFromRoutine } from '$lib/domain/workout';
import { tend } from '$lib/state/tend.svelte';
import WorkoutSummary from './WorkoutSummary.svelte';

const STARTED = 1_700_000_000_000;

function pushA(): Routine {
	return {
		id: 'r-1',
		name: 'Push A',
		freq: 3,
		exercises: [
			{ name: 'Bench Press', group: 'Chest', sets: 2, reps: 10, load: 60 },
			{ name: 'Lateral Raise', group: 'Shoulders', sets: 1, reps: 12, load: 8 }
		]
	};
}

/** File a session that ran 45:30 and had every set but the last one ticked. */
function fileSession() {
	const workout: Workout = workoutFromRoutine(pushA(), {
		id: 'w-1',
		date: todayISO(),
		startedAt: STARTED
	});
	workout.finishedAt = STARTED + 2730 * 1000;
	workout.exercises[0]?.sets.forEach((set) => (set.done = true));
	tend.state.workouts.push(workout);
	tend.persist();
}

beforeEach(() => {
	localStorage.clear();
	tend.resetAll();
});

describe('WorkoutSummary', () => {
	it('closes the session by name', async () => {
		fileSession();
		await render(WorkoutSummary);
		await expect.element(page.getByText('Session done')).toBeInTheDocument();
		await expect.element(page.getByRole('heading', { name: 'Push A' })).toBeInTheDocument();
		await expect
			.element(page.getByText('Logged and filed. Nothing else to do.'))
			.toBeInTheDocument();
	});

	it('counts the session in time, sets and kilograms', async () => {
		fileSession();
		await render(WorkoutSummary);
		await expect.element(page.getByText('0:45:30')).toBeInTheDocument();
		await expect.element(page.getByText('2', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText('1200 kg')).toBeInTheDocument();
	});

	it('reads back each movement and what it went at', async () => {
		fileSession();
		await render(WorkoutSummary);
		await expect.element(page.getByText('2 × 10 @ 60')).toBeInTheDocument();
	});

	it('says an untouched movement was not done, rather than counting it as zero', async () => {
		fileSession();
		await render(WorkoutSummary);
		await expect.element(page.getByText('not done')).toBeInTheDocument();
	});

	it('offers the way on and the way out', async () => {
		fileSession();
		await render(WorkoutSummary);
		await expect
			.element(page.getByRole('link', { name: 'See training progress' }))
			.toHaveAttribute('href', '/exercise/progress');
		await expect
			.element(page.getByRole('link', { name: 'Done' }))
			.toHaveAttribute('href', '/exercise');
	});

	it('reads an exercise with no sets at all back the same way', async () => {
		fileSession();
		const filed = tend.state.workouts.at(-1);
		if (filed) filed.exercises = [{ name: 'Pull-up', group: 'Back', note: '', sets: [] }];
		await render(WorkoutSummary);
		await expect.element(page.getByText('not done')).toBeInTheDocument();
	});

	it('says so when nothing has been filed yet', async () => {
		await render(WorkoutSummary);
		await expect.element(page.getByText('Nothing filed yet')).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Back to Exercise' })).toBeInTheDocument();
	});
});
