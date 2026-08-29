import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { Workout } from '$lib/domain/types';
import ResumeWorkoutBanner from './ResumeWorkoutBanner.svelte';

/** A session in progress with `done` of its three sets ticked. */
function workout(done: number): Workout {
	return {
		id: 'w-1',
		routineId: 'push',
		routineName: 'Chest & Shoulders',
		date: '2026-01-05',
		startedAt: 0,
		finishedAt: null,
		exerciseIndex: 0,
		exercises: [
			{
				name: 'Bench Press',
				group: 'Chest',
				note: '',
				sets: Array.from({ length: 3 }, (_, i) => ({ reps: 8, load: 45, done: i < done }))
			}
		]
	};
}

describe('ResumeWorkoutBanner', () => {
	it('stays out of the way when nothing is running', async () => {
		await render(ResumeWorkoutBanner, { props: { workout: null } });
		expect(page.getByRole('link').elements()).toHaveLength(0);
	});

	it('stays out of the way when the session logged nothing', async () => {
		await render(ResumeWorkoutBanner, { props: { workout: workout(0) } });
		expect(page.getByRole('link').elements()).toHaveLength(0);
	});

	it('names the routine that is still open', async () => {
		await render(ResumeWorkoutBanner, { props: { workout: workout(2) } });
		await expect.element(page.getByText('Chest & Shoulders in progress')).toBeInTheDocument();
	});

	it('counts what has been logged so far', async () => {
		await render(ResumeWorkoutBanner, { props: { workout: workout(2) } });
		await expect.element(page.getByText('2 sets logged')).toBeInTheDocument();
	});

	it('counts a single set in the singular', async () => {
		await render(ResumeWorkoutBanner, { props: { workout: workout(1) } });
		await expect.element(page.getByText('1 set logged')).toBeInTheDocument();
	});

	it('leads back to the session', async () => {
		await render(ResumeWorkoutBanner, { props: { workout: workout(1) } });
		await expect.element(page.getByRole('link')).toHaveAttribute('href', '/exercise/session');
	});

	it('follows a session that moved on while the banner was on screen', async () => {
		const props: { workout: Workout | null } = $state({ workout: workout(1) });
		await render(ResumeWorkoutBanner, { props });
		props.workout = { ...workout(3), routineName: 'Legs' };
		await expect.element(page.getByText('Legs in progress')).toBeInTheDocument();
		await expect.element(page.getByText('3 sets logged')).toBeInTheDocument();
	});
});
