import {
	plannedRoutineId,
	weekOf,
	WEEKS_IN_YEAR,
	type CalendarWeek
} from '$lib/domain/training-plan';
import type { LoadUnit, MuscleGroup, PlannedWeek, Routine, Workout } from '$lib/domain/types';
import { round1 } from '$lib/domain/utils';
import { countsAsTraining, setsDone } from '$lib/domain/workout';

/** Only a finished workout counts as training done; an abandoned one is not evidence. */
function finished(workouts: Workout[]): Workout[] {
	return workouts.filter((w) => w.finishedAt !== null);
}

export type TrendPoint = {
	/** The training year the week belongs to, which is not always its calendar year. */
	year: number;
	week: number;
	/** "W34", the training week the top set was lifted in. */
	label: string;
	load: number;
};

/**
 * The heaviest set of one movement, week by week. Weekly rather than per
 * session, because two sessions in a week make a sawtooth out of a line that is
 * meant to answer one question: is this getting heavier?
 *
 * Weeks are held by year as well as by number: week 52 and week 1 either side
 * of New Year are consecutive, and sorting on the number alone would draw a
 * year of progress as a collapse.
 */
export function loadTrend(workouts: Workout[], name: string, count = 7): TrendPoint[] {
	const byWeek = new Map<string, TrendPoint>();
	for (const workout of finished(workouts)) {
		const sets = workout.exercises.find((e) => e.name === name)?.sets.filter((s) => s.done) ?? [];
		if (sets.length === 0) continue;
		const top = Math.max(...sets.map((s) => s.load));
		const { year, week } = weekOf(workout.date);
		const key = `${year}-${week}`;
		const load = Math.max(byWeek.get(key)?.load ?? 0, top);
		byWeek.set(key, { year, week, label: `W${week}`, load });
	}
	return [...byWeek.values()].sort((a, b) => a.year - b.year || a.week - b.week).slice(-count);
}

/**
 * How many weeks the trend reaches back over, gaps included. Two points
 * fourteen weeks apart are fifteen weeks of history, not two: counting the
 * points instead would caption a long silence as a short streak.
 */
export function weekSpan(points: TrendPoint[]): number {
	const first = points[0];
	const last = points.at(-1);
	if (!first || !last) return 0;
	return (last.year - first.year) * WEEKS_IN_YEAR + (last.week - first.week) + 1;
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
	// A session that logged nothing is filed, so the summary can say so, but it is
	// not a session the plan asked for. Counting it would let a week be met by
	// walking in and out again.
	for (const workout of workouts.filter(countsAsTraining)) {
		const at = weekOf(workout.date);
		if (at.year === year) done.set(at.week, (done.get(at.week) ?? 0) + 1);
	}
	return weeks
		.filter((w) => w.week <= throughWeek)
		.slice(-count)
		.map((w) => {
			const routine = routines.find((r) => r.id === plannedRoutineId(plan, year, w.week));
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

/**
 * How much the movement on the chart has moved, as a sentence. Empty when there
 * is nothing to report: one week of history has no change in it, and a top set
 * that has not budged is not news.
 */
function loadSentence(workouts: Workout[], unit: LoadUnit): string {
	// The movement the load trend opens on, so the note and the chart it sends
	// you to are talking about the same thing.
	const name = trainedExercises(workouts)[0];
	if (name === undefined) return '';
	const points = loadTrend(workouts, name);
	const first = points[0];
	const last = points.at(-1);
	if (!first || !last || first.load === last.load) return '';
	const change = round1(Math.abs(last.load - first.load));
	const direction = last.load > first.load ? 'heavier' : 'lighter';
	// One less than the span: the span counts both end weeks, and what is being
	// pointed at is the week the first bar was lifted in, not the width of the
	// chart.
	const ago = weekSpan(points) - 1;
	return `${name} is ${change} ${unit} ${direction} than ${ago} ${ago === 1 ? 'week' : 'weeks'} ago.`;
}

/**
 * Which group the plan is thinnest on, as a sentence. Empty until there are two
 * groups to compare: a single group trained is not the thin part of anything,
 * it is all there is.
 */
function thinGroupSentence(workouts: Workout[], sinceISO: string): string {
	const volume = volumeByGroup(workouts, sinceISO);
	const thinnest = volume.length > 1 ? volume.at(-1) : undefined;
	if (!thinnest) return '';
	// "Legs are", "Chest is" — the group names that read as plurals are the ones
	// that end in s, and that holds for every group in the library.
	const verb = thinnest.group.endsWith('s') ? 'are' : 'is';
	return `${thinnest.group} ${verb} still the thin part of the plan.`;
}

/**
 * The take-away under the session summary: what the movement on the chart has
 * done lately, and which group the plan is thinnest on. Either half is dropped
 * when it has nothing to say, and with neither there is no note and no card.
 */
export function summaryNote(args: {
	workouts: Workout[];
	unit: LoadUnit;
	/** The window the volume half looks over, as the volume card uses. */
	sinceISO: string;
}): string {
	return [loadSentence(args.workouts, args.unit), thinGroupSentence(args.workouts, args.sinceISO)]
		.filter((sentence) => sentence !== '')
		.join(' ');
}
