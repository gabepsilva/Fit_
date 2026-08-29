import { weekOf, type CalendarWeek } from '$lib/domain/training-plan';
import type { MuscleGroup, PlannedWeek, Routine, Workout } from '$lib/domain/types';
import { setsDone } from '$lib/domain/workout';

/** Only a finished workout counts as training done; an abandoned one is not evidence. */
function finished(workouts: Workout[]): Workout[] {
	return workouts.filter((w) => w.finishedAt !== null);
}

export type TrendPoint = {
	/** "W34", the training week the top set was lifted in. */
	label: string;
	load: number;
};

/**
 * The heaviest set of one movement, week by week. Weekly rather than per
 * session, because two sessions in a week make a sawtooth out of a line that is
 * meant to answer one question: is this getting heavier?
 */
export function loadTrend(workouts: Workout[], name: string, count = 7): TrendPoint[] {
	const byWeek = new Map<number, number>();
	for (const workout of finished(workouts)) {
		const sets = workout.exercises.find((e) => e.name === name)?.sets.filter((s) => s.done) ?? [];
		if (sets.length === 0) continue;
		const top = Math.max(...sets.map((s) => s.load));
		const { week } = weekOf(workout.date);
		byWeek.set(week, Math.max(byWeek.get(week) ?? 0, top));
	}
	return [...byWeek.entries()]
		.sort((a, b) => a[0] - b[0])
		.slice(-count)
		.map(([week, load]) => ({ label: `W${week}`, load }));
}

/** The movements trained most often, so the trend has something worth charting. */
export function trainedExercises(workouts: Workout[]): string[] {
	const counts = new Map<string, number>();
	for (const workout of finished(workouts)) {
		for (const exercise of workout.exercises) {
			if (setsDone(exercise.sets) > 0) {
				counts.set(exercise.name, (counts.get(exercise.name) ?? 0) + 1);
			}
		}
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([n]) => n);
}

export type GroupVolume = {
	group: MuscleGroup;
	sets: number;
	/** Share of the busiest group, which is what the bar next to it draws. */
	pct: number;
};

export function volumeByGroup(workouts: Workout[], sinceISO: string): GroupVolume[] {
	const counts = new Map<MuscleGroup, number>();
	for (const workout of finished(workouts)) {
		if (workout.date < sinceISO) continue;
		for (const exercise of workout.exercises) {
			const done = setsDone(exercise.sets);
			if (done > 0) counts.set(exercise.group, (counts.get(exercise.group) ?? 0) + done);
		}
	}
	const most = Math.max(0, ...counts.values());
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([group, sets]) => ({
			group,
			sets,
			pct: most === 0 ? 0 : Math.round((sets / most) * 100)
		}));
}

export type AdherenceWeek = {
	week: number;
	label: string;
	planned: number;
	done: number;
};

/**
 * What the calendar asked for against what happened, for the weeks just gone.
 * A week the plan left empty asks for nothing, so training anyway shows as done
 * without a shortfall to explain.
 */
export function weeklyAdherence(args: {
	workouts: Workout[];
	plan: PlannedWeek[];
	routines: Routine[];
	weeks: CalendarWeek[];
	year: number;
	throughWeek: number;
	count?: number;
}): AdherenceWeek[] {
	const { workouts, plan, routines, weeks, year, throughWeek, count = 4 } = args;
	const done = new Map<number, number>();
	for (const workout of finished(workouts)) {
		const at = weekOf(workout.date);
		if (at.year === year) done.set(at.week, (done.get(at.week) ?? 0) + 1);
	}
	return weeks
		.filter((w) => w.week <= throughWeek)
		.slice(-count)
		.map((w) => {
			const routineId = plan.find((p) => p.year === year && p.week === w.week)?.routineId;
			const routine = routines.find((r) => r.id === routineId);
			return {
				week: w.week,
				label: `Week ${w.week}`,
				planned: routine?.freq ?? 0,
				done: done.get(w.week) ?? 0
			};
		});
}

export type PersonalRecord = {
	name: string;
	load: number;
	reps: number;
	date: string;
};

/** The heaviest completed set of each movement, heaviest movement first. */
export function personalRecords(workouts: Workout[], limit = 3): PersonalRecord[] {
	const best = new Map<string, PersonalRecord>();
	for (const workout of finished(workouts)) {
		for (const exercise of workout.exercises) {
			for (const set of exercise.sets) {
				if (!set.done || set.load === 0) continue;
				const current = best.get(exercise.name);
				if (!current || set.load > current.load) {
					best.set(exercise.name, {
						name: exercise.name,
						load: set.load,
						reps: set.reps,
						date: workout.date
					});
				}
			}
		}
	}
	return [...best.values()].sort((a, b) => b.load - a.load).slice(0, limit);
}
