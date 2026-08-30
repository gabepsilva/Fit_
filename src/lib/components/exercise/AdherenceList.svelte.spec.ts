import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { weekOf } from '$lib/domain/training-plan';
import type { PlannedWeek, Routine, Workout } from '$lib/domain/types';
import { todayISO } from '$lib/domain/utils';
import { workoutFromRoutine } from '$lib/domain/workout';
import AdherenceList from './AdherenceList.svelte';

const push: Routine = {
	id: 'r1',
	name: 'Push',
	freq: 3,
	exercises: [{ name: 'Bench Press', group: 'Chest', sets: 1, reps: 8, load: 40 }]
};
const now = weekOf(todayISO());
const plannedNow: PlannedWeek[] = [{ year: now.year, week: now.week, routineId: push.id }];

/**
 * A session that actually logged something. A finished session with nothing
 * ticked is filed so the summary can say so, but it is not a session the plan
 * asked for, so it is not what this list counts.
 */
const today: Workout = (() => {
	const workout = workoutFromRoutine(push, { id: 'w1', date: todayISO(), startedAt: 0 });
	for (const exercise of workout.exercises) {
		for (const set of exercise.sets) set.done = true;
	}
	return { ...workout, finishedAt: 1 };
})();

describe('AdherenceList', () => {
	it('draws a cell per planned session and fills only the ones that happened', async () => {
		await render(AdherenceList, {
			props: { workouts: [today], plan: plannedNow, routines: [push] }
		});
		const row = [...document.querySelectorAll('li')].find((li) =>
			li.textContent?.includes(`Week ${now.week}`)
		);
		const cells = [...(row?.querySelectorAll('[aria-hidden="true"] > span') ?? [])];
		// Three sessions were asked for and one was logged, so one cell is filled.
		expect(cells.map((cell) => cell.className.includes('bg-primary'))).toEqual([
			true,
			false,
			false
		]);
	});

	it('holds finished sessions against what the week planned', async () => {
		await render(AdherenceList, {
			props: { workouts: [today], plan: plannedNow, routines: [push] }
		});
		await expect.element(page.getByText('1 of 3')).toBeInTheDocument();
		await expect.element(page.getByText(`Week ${now.week}`)).toBeInTheDocument();
	});

	it('reports a week the plan left empty without a shortfall to explain', async () => {
		await render(AdherenceList, { props: { workouts: [today], plan: [], routines: [] } });
		await expect.element(page.getByText('1 done')).toBeInTheDocument();
	});

	it('says so when the calendar and the log are both empty', async () => {
		await render(AdherenceList, { props: { workouts: [], plan: [], routines: [] } });
		await expect.element(page.getByText(/nothing to hold them against/)).toBeInTheDocument();
	});
});
