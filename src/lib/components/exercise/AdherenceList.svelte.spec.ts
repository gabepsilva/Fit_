import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { weekOf } from '$lib/domain/training-plan';
import type { PlannedWeek, Routine, Workout } from '$lib/domain/types';
import { todayISO } from '$lib/domain/utils';
import { workoutFromRoutine } from '$lib/domain/workout';
import AdherenceList from './AdherenceList.svelte';

const push: Routine = { id: 'r1', name: 'Push', freq: 3, exercises: [] };
const now = weekOf(todayISO());
const plannedNow: PlannedWeek[] = [{ year: now.year, week: now.week, routineId: push.id }];

const today: Workout = {
	...workoutFromRoutine(push, { id: 'w1', date: todayISO(), startedAt: 0 }),
	finishedAt: 1
};

describe('AdherenceList', () => {
	it('keeps the reading the design asks for', async () => {
		await render(AdherenceList, { props: { workouts: [], plan: [], routines: [] } });
		await expect
			.element(page.getByText(/A missed week is information, not a failure/))
			.toBeInTheDocument();
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
