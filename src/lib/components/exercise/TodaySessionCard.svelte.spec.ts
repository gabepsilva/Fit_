import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { PlannedWeek, Routine, Workout } from '$lib/domain/types';
import TodaySessionCard from './TodaySessionCard.svelte';

/** Week 1 of 2026 runs Monday the 5th to Sunday the 11th. */
const MONDAY = '2026-01-05';
const TUESDAY = '2026-01-06';
const WEDNESDAY = '2026-01-07';
const THURSDAY = '2026-01-08';

function routine(id: string, name: string, freq: number, moves: number): Routine {
	return {
		id,
		name,
		freq,
		exercises: Array.from({ length: moves }, (_, i) => ({
			name: `Move ${i + 1}`,
			group: 'Chest',
			sets: 3,
			reps: 10,
			load: 20
		}))
	};
}

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

const push = routine('push', 'Chest & Shoulders', 3, 5);
const legs = routine('legs', 'Legs', 3, 5);
const plan: PlannedWeek[] = [{ year: 2026, week: 1, routineId: 'push' }];
const noop = () => {};

const base = { routines: [push, legs], plan, workouts: [], today: MONDAY, onstart: noop };

describe('TodaySessionCard', () => {
	it('names the routine the plan calls for today', async () => {
		await render(TodaySessionCard, { props: { ...base } });
		await expect
			.element(page.getByRole('heading', { name: 'Chest & Shoulders', level: 2 }))
			.toBeInTheDocument();
	});

	it('says what the session costs before it is started', async () => {
		await render(TodaySessionCard, { props: { ...base } });
		await expect
			.element(page.getByText('5 exercises · 15 sets · about 48 min'))
			.toBeInTheDocument();
	});

	it('previews the first four movements and stops there', async () => {
		await render(TodaySessionCard, { props: { ...base } });
		await expect.element(page.getByText('Move 4', { exact: true })).toBeInTheDocument();
		expect(page.getByText('Move 5', { exact: true }).elements()).toHaveLength(0);
	});

	it('starts the routine the plan chose', async () => {
		const onstart = vi.fn();
		await render(TodaySessionCard, { props: { ...base, onstart } });
		await page.getByRole('button', { name: 'Start session' }).click();
		expect(onstart).toHaveBeenCalledWith('push');
	});

	it('opens the whole routine for anyone who wants to read it first', async () => {
		await render(TodaySessionCard, { props: { ...base } });
		await expect
			.element(page.getByRole('link', { name: 'See the whole routine' }))
			.toHaveAttribute('href', '/exercise/routines/push');
	});

	it('calls a day the routine does not fall on a rest day', async () => {
		await render(TodaySessionCard, { props: { ...base, today: TUESDAY } });
		await expect
			.element(page.getByRole('heading', { name: 'Rest day', level: 2 }))
			.toBeInTheDocument();
		await expect.element(page.getByText('The calendar has nothing scheduled.')).toBeInTheDocument();
	});

	it('rests when the week has no routine on it at all', async () => {
		await render(TodaySessionCard, { props: { ...base, plan: [] } });
		await expect
			.element(page.getByRole('heading', { name: 'Rest day', level: 2 }))
			.toBeInTheDocument();
	});

	it('says what the week already holds, in the singular', async () => {
		await render(TodaySessionCard, {
			props: { ...base, today: TUESDAY, workouts: [finished(MONDAY)] }
		});
		await expect.element(page.getByText(/1 session done this week already/)).toBeInTheDocument();
	});

	it('counts more than one session done this week', async () => {
		await render(TodaySessionCard, {
			props: { ...base, today: THURSDAY, workouts: [finished(MONDAY), finished(WEDNESDAY)] }
		});
		await expect.element(page.getByText(/2 sessions done this week already/)).toBeInTheDocument();
	});

	it('ignores a workout from an earlier week', async () => {
		await render(TodaySessionCard, {
			props: { ...base, today: TUESDAY, workouts: [finished('2026-01-01')] }
		});
		await expect.element(page.getByText('The calendar has nothing scheduled.')).toBeInTheDocument();
	});

	it('trains this week’s routine when someone trains anyway', async () => {
		const onstart = vi.fn();
		await render(TodaySessionCard, { props: { ...base, today: TUESDAY, onstart } });
		await page.getByRole('button', { name: 'Train anyway' }).click();
		expect(onstart).toHaveBeenCalledWith('push');
	});

	it('falls back to the first routine when the week names none', async () => {
		const onstart = vi.fn();
		await render(TodaySessionCard, {
			props: { ...base, routines: [legs, push], plan: [], onstart }
		});
		await page.getByRole('button', { name: 'Train anyway' }).click();
		expect(onstart).toHaveBeenCalledWith('legs');
	});

	it('has nothing to train when there is no routine to train', async () => {
		await render(TodaySessionCard, { props: { ...base, routines: [], plan: [] } });
		await expect.element(page.getByRole('button', { name: 'Train anyway' })).toBeDisabled();
	});

	it('leads to the planner when the rest day is the wrong one', async () => {
		await render(TodaySessionCard, { props: { ...base, today: TUESDAY } });
		await expect
			.element(page.getByRole('link', { name: 'Change the plan' }))
			.toHaveAttribute('href', '/exercise/plan');
	});
});
