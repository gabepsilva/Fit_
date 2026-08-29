import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { PlannedWeek, Routine, Workout } from '$lib/domain/types';
import TrainingWeekStrip from './TrainingWeekStrip.svelte';

/** Week 1 of 2026 runs Monday the 5th to Sunday the 11th. */
const MONDAY = '2026-01-05';
const TUESDAY = '2026-01-06';
const WEDNESDAY = '2026-01-07';

const push: Routine = {
	id: 'push',
	name: 'Chest & Shoulders',
	freq: 3,
	exercises: [{ name: 'Bench Press', group: 'Chest', sets: 4, reps: 8, load: 45 }]
};

function finished(date: string): Workout {
	return {
		id: `w-${date}`,
		routineId: 'push',
		routineName: 'Chest & Shoulders',
		date,
		startedAt: 0,
		finishedAt: 1,
		exerciseIndex: 0,
		exercises: []
	};
}

const plan: PlannedWeek[] = [{ year: 2026, week: 1, routineId: 'push' }];
const base = { routines: [push], plan, workouts: [], today: TUESDAY };

/** The small filled markers, which is how a day says it happened. */
function markers(className: string) {
	return document.querySelectorAll(`.size-1\\.5.${className}`);
}

describe('TrainingWeekStrip', () => {
	it('draws the week Monday first', async () => {
		await render(TrainingWeekStrip, { props: { ...base } });
		await expect.element(page.getByText('Mon')).toBeInTheDocument();
		await expect.element(page.getByText('Sun')).toBeInTheDocument();
	});

	it('names the current day rather than its weekday', async () => {
		await render(TrainingWeekStrip, { props: { ...base } });
		await expect.element(page.getByText('Today')).toBeInTheDocument();
		expect(page.getByText('Tue', { exact: true }).elements()).toHaveLength(0);
	});

	it('marks the days the week’s routine falls on', async () => {
		await render(TrainingWeekStrip, { props: { ...base } });
		expect(page.getByText('C', { exact: true }).elements()).toHaveLength(3);
	});

	it('leaves the days between them empty', async () => {
		await render(TrainingWeekStrip, { props: { ...base } });
		expect(page.getByText('·', { exact: true }).elements()).toHaveLength(4);
	});

	it('leaves the whole week empty when nothing is planned', async () => {
		await render(TrainingWeekStrip, { props: { ...base, plan: [] } });
		expect(page.getByText('·', { exact: true }).elements()).toHaveLength(7);
	});

	it('fills in a day earlier in the week that was trained', async () => {
		await render(TrainingWeekStrip, {
			props: { ...base, today: WEDNESDAY, workouts: [finished(MONDAY)] }
		});
		expect(markers('bg-primary')).toHaveLength(1);
	});

	it('leaves an earlier day that was skipped unfilled', async () => {
		await render(TrainingWeekStrip, { props: { ...base, today: WEDNESDAY } });
		expect(markers('bg-primary')).toHaveLength(0);
	});

	it('claims nothing about a day that has not happened yet', async () => {
		await render(TrainingWeekStrip, {
			props: { ...base, today: MONDAY, workouts: [finished(WEDNESDAY)] }
		});
		expect(markers('bg-primary')).toHaveLength(0);
	});

	it('sends anyone who disagrees with the week to the planner', async () => {
		await render(TrainingWeekStrip, { props: { ...base } });
		await expect
			.element(page.getByRole('link', { name: 'Edit plan' }))
			.toHaveAttribute('href', '/exercise/plan');
	});
});
