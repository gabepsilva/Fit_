import { describe, expect, it } from 'vitest';
import { calendarWeeks } from './training-plan';
import {
	loadTrend,
	personalRecords,
	trainedExercises,
	volumeByGroup,
	weeklyAdherence
} from './training-progress';
import { REST_WEEK, type MuscleGroup, type Routine, type Workout, type WorkoutSet } from './types';
import { addDaysISO } from './utils';

/** Week 1 of the 2026 training year opens on 5 January; week 2 on the 12th. */
const WEEK_1 = '2026-01-05';
const WEEK_1_AGAIN = '2026-01-08';
const WEEK_2 = '2026-01-12';
const WEEK_3 = '2026-01-19';

function set(load: number, reps = 8, done = true): WorkoutSet {
	return { reps, load, done };
}

function ex(name: string, group: MuscleGroup, sets: WorkoutSet[]) {
	return { name, group, sets, note: '' };
}

let counter = 0;

function done(date: string, exercises: ReturnType<typeof ex>[]): Workout {
	counter += 1;
	return {
		id: `w-${counter}`,
		routineId: 'push',
		routineName: 'Push',
		date,
		startedAt: 0,
		finishedAt: 1,
		exerciseIndex: 0,
		exercises
	};
}

/** A session that was started and walked away from: not evidence of anything. */
function abandoned(date: string, exercises: ReturnType<typeof ex>[]): Workout {
	return { ...done(date, exercises), finishedAt: null };
}

describe('the load trend', () => {
	it('takes the heaviest ticked set of the week', () => {
		const trend = loadTrend(
			[done(WEEK_1, [ex('Squat', 'Legs', [set(60), set(80), set(70)])])],
			'Squat'
		);
		expect(trend).toEqual([{ label: 'W1', load: 80 }]);
	});

	it('ignores a heavier set that was never ticked', () => {
		const trend = loadTrend(
			[done(WEEK_1, [ex('Squat', 'Legs', [set(60), set(100, 8, false)])])],
			'Squat'
		);
		expect(trend).toEqual([{ label: 'W1', load: 60 }]);
	});

	it('merges two sessions in the same week into one point', () => {
		const trend = loadTrend(
			[
				done(WEEK_1, [ex('Squat', 'Legs', [set(60)])]),
				done(WEEK_1_AGAIN, [ex('Squat', 'Legs', [set(75)])]),
				done(WEEK_2, [ex('Squat', 'Legs', [set(65)])])
			],
			'Squat'
		);
		expect(trend).toEqual([
			{ label: 'W1', load: 75 },
			{ label: 'W2', load: 65 }
		]);
	});

	it('leaves an unfinished session out of the line', () => {
		const trend = loadTrend(
			[
				done(WEEK_1, [ex('Squat', 'Legs', [set(60)])]),
				abandoned(WEEK_2, [ex('Squat', 'Legs', [set(200)])])
			],
			'Squat'
		);
		expect(trend).toEqual([{ label: 'W1', load: 60 }]);
	});

	it('runs oldest to newest whatever order the sessions arrive in', () => {
		const trend = loadTrend(
			[
				done(WEEK_3, [ex('Squat', 'Legs', [set(70)])]),
				done(WEEK_1, [ex('Squat', 'Legs', [set(60)])])
			],
			'Squat'
		);
		expect(trend.map((p) => p.label)).toEqual(['W1', 'W3']);
	});

	it('keeps only the last few weeks asked for', () => {
		const workouts = [WEEK_1, WEEK_2, WEEK_3].map((date, i) =>
			done(date, [ex('Squat', 'Legs', [set(60 + i * 5)])])
		);
		expect(loadTrend(workouts, 'Squat', 2)).toEqual([
			{ label: 'W2', load: 65 },
			{ label: 'W3', load: 70 }
		]);
	});

	it('shows seven weeks when nobody said how many', () => {
		const workouts = Array.from({ length: 9 }, (_, i) =>
			done(addDaysISO(WEEK_1, i * 7), [ex('Squat', 'Legs', [set(60 + i)])])
		);
		expect(loadTrend(workouts, 'Squat').map((p) => p.label)).toEqual([
			'W3',
			'W4',
			'W5',
			'W6',
			'W7',
			'W8',
			'W9'
		]);
	});

	it('has no line for a movement that was never lifted', () => {
		expect(loadTrend([done(WEEK_1, [ex('Squat', 'Legs', [set(60)])])], 'Bench Press')).toEqual([]);
		expect(loadTrend([], 'Squat')).toEqual([]);
	});

	it('has no line for a movement opened but never ticked', () => {
		const workouts = [done(WEEK_1, [ex('Squat', 'Legs', [set(60, 8, false)])])];
		expect(loadTrend(workouts, 'Squat')).toEqual([]);
	});
});

describe('the movements worth charting', () => {
	it('puts the most often trained first', () => {
		const workouts = [
			done(WEEK_1, [ex('Squat', 'Legs', [set(60)]), ex('Bench Press', 'Chest', [set(40)])]),
			done(WEEK_2, [ex('Squat', 'Legs', [set(65)])])
		];
		expect(trainedExercises(workouts)).toEqual(['Squat', 'Bench Press']);
	});

	it('breaks a tie by name rather than by chance', () => {
		const workouts = [
			done(WEEK_1, [ex('Squat', 'Legs', [set(60)]), ex('Bench Press', 'Chest', [set(40)])])
		];
		expect(trainedExercises(workouts)).toEqual(['Bench Press', 'Squat']);
	});

	it('leaves out a movement that was opened and skipped', () => {
		const workouts = [
			done(WEEK_1, [ex('Squat', 'Legs', [set(60)]), ex('Leg Curl', 'Legs', [set(30, 8, false)])])
		];
		expect(trainedExercises(workouts)).toEqual(['Squat']);
	});

	it('leaves out an unfinished session', () => {
		expect(trainedExercises([abandoned(WEEK_1, [ex('Squat', 'Legs', [set(60)])])])).toEqual([]);
	});
});

describe('volume by muscle group', () => {
	const workouts = [
		done(WEEK_1, [
			ex('Squat', 'Legs', [set(60), set(60), set(60)]),
			ex('Bench Press', 'Chest', [set(40), set(40, 8, false)])
		]),
		done(WEEK_2, [ex('Squat', 'Legs', [set(65)])])
	];

	it('counts the ticked sets under each group', () => {
		expect(volumeByGroup(workouts, WEEK_1)).toEqual([
			{ group: 'Legs', sets: 4, pct: 100 },
			{ group: 'Chest', sets: 1, pct: 25 }
		]);
	});

	it('draws every bar against the busiest group', () => {
		const bars = volumeByGroup(workouts, WEEK_1);
		expect(bars[0]?.pct).toBe(100);
		expect(bars[1]?.pct).toBe(Math.round((1 / 4) * 100));
	});

	it('ignores anything trained before the window opens', () => {
		expect(volumeByGroup(workouts, WEEK_2)).toEqual([{ group: 'Legs', sets: 1, pct: 100 }]);
	});

	it('ignores an unfinished session', () => {
		const only = [abandoned(WEEK_1, [ex('Squat', 'Legs', [set(60)])])];
		expect(volumeByGroup(only, WEEK_1)).toEqual([]);
	});

	it('has nothing to draw when nothing was ticked', () => {
		expect(
			volumeByGroup([done(WEEK_1, [ex('Squat', 'Legs', [set(60, 8, false)])])], WEEK_1)
		).toEqual([]);
		expect(volumeByGroup([], WEEK_1)).toEqual([]);
	});
});

describe('weekly adherence', () => {
	const weeks = calendarWeeks(2026);
	const routines: Routine[] = [
		{ id: 'push', name: 'Push', freq: 3, exercises: [] },
		{ id: 'legs', name: 'Legs', freq: 2, exercises: [] }
	];
	const plan = [
		{ year: 2026, week: 1, routineId: 'push' },
		{ year: 2026, week: 2, routineId: REST_WEEK },
		{ year: 2026, week: 4, routineId: 'legs' },
		{ year: 2025, week: 3, routineId: 'push' }
	];

	function adherence(workouts: Workout[], count = 4) {
		return weeklyAdherence({
			workouts,
			plan,
			routines,
			weeks,
			year: 2026,
			throughWeek: 4,
			count
		});
	}

	it('asks for as many sessions as the planned routine runs', () => {
		expect(adherence([]).map((w) => w.planned)).toEqual([3, 0, 0, 2]);
	});

	it('asks for nothing in a rest week or a week nobody planned', () => {
		const rows = adherence([]);
		expect(rows[1]).toEqual({ week: 2, label: 'Week 2', planned: 0, done: 0 });
		expect(rows[2]?.planned).toBe(0);
	});

	it('counts the sessions actually finished in each week', () => {
		const rows = adherence([
			done(WEEK_1, [ex('Squat', 'Legs', [set(60)])]),
			done(WEEK_1_AGAIN, [ex('Squat', 'Legs', [set(60)])]),
			done(WEEK_2, [ex('Squat', 'Legs', [set(60)])])
		]);
		expect(rows.map((w) => w.done)).toEqual([2, 1, 0, 0]);
	});

	it('does not count an unfinished session as training done', () => {
		expect(adherence([abandoned(WEEK_1, [ex('Squat', 'Legs', [set(60)])])])[0]?.done).toBe(0);
	});

	it('ignores a session from another year', () => {
		expect(adherence([done('2025-06-01', [ex('Squat', 'Legs', [set(60)])])])[0]?.done).toBe(0);
	});

	it('stops at the week it was asked to report through', () => {
		expect(adherence([], 52).map((w) => w.week)).toEqual([1, 2, 3, 4]);
	});

	it('shows only the last few weeks', () => {
		expect(adherence([], 2).map((w) => w.week)).toEqual([3, 4]);
	});

	it('shows four weeks when nobody said how many', () => {
		const rows = weeklyAdherence({
			workouts: [],
			plan,
			routines,
			weeks,
			year: 2026,
			throughWeek: 10
		});
		expect(rows.map((w) => w.week)).toEqual([7, 8, 9, 10]);
	});

	it('labels each row by its week number', () => {
		expect(adherence([]).map((w) => w.label)).toEqual(['Week 1', 'Week 2', 'Week 3', 'Week 4']);
	});
});

describe('personal records', () => {
	const workouts = [
		done(WEEK_1, [
			ex('Squat', 'Legs', [set(80, 5), set(100, 3)]),
			ex('Pull-up', 'Back', [set(0, 12)]),
			ex('Bench Press', 'Chest', [set(60, 6)])
		]),
		done(WEEK_2, [ex('Squat', 'Legs', [set(90, 4)])])
	];

	it('keeps the heaviest ticked set of each movement', () => {
		expect(personalRecords(workouts, 2)).toEqual([
			{ name: 'Squat', load: 100, reps: 3, date: WEEK_1 },
			{ name: 'Bench Press', load: 60, reps: 6, date: WEEK_1 }
		]);
	});

	it('orders the records by load, heaviest first', () => {
		expect(personalRecords(workouts).map((r) => r.load)).toEqual([100, 60]);
	});

	it('has no record to set for a bodyweight movement', () => {
		expect(personalRecords(workouts).map((r) => r.name)).not.toContain('Pull-up');
	});

	it('ignores a heavy set that was never ticked', () => {
		const only = [done(WEEK_1, [ex('Squat', 'Legs', [set(60), set(200, 1, false)])])];
		expect(personalRecords(only)).toEqual([{ name: 'Squat', load: 60, reps: 8, date: WEEK_1 }]);
	});

	it('ignores an unfinished session', () => {
		expect(personalRecords([abandoned(WEEK_1, [ex('Squat', 'Legs', [set(60)])])])).toEqual([]);
	});

	it('shows only as many records as it was asked for', () => {
		expect(personalRecords(workouts, 1)).toHaveLength(1);
		expect(personalRecords(workouts, 5)).toHaveLength(2);
	});

	it('shows three records when nobody said how many', () => {
		const many = [
			done(WEEK_1, [
				ex('Squat', 'Legs', [set(100)]),
				ex('Deadlift', 'Legs', [set(120)]),
				ex('Bench Press', 'Chest', [set(60)]),
				ex('Barbell Curl', 'Biceps', [set(20)])
			])
		];
		expect(personalRecords(many).map((r) => r.name)).toEqual(['Deadlift', 'Squat', 'Bench Press']);
	});
});
