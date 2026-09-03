import type { Routine, Workout, WorkoutExercise, WorkoutSet } from '$lib/domain/types';

/**
 * Open a routine into the workout that will record it. Sets are written out up
 * front — the routine may be edited later, but what was lifted must not change.
 */
export function workoutFromRoutine(
	routine: Routine,
	args: { id: string; date: string; startedAt: number }
): Workout {
	return {
		id: args.id,
		routineId: routine.id,
		routineName: routine.name,
		date: args.date,
		startedAt: args.startedAt,
		finishedAt: null,
		exerciseIndex: 0,
		exercises: routine.exercises.map((e) => ({
			name: e.name,
			group: e.group,
			note: '',
			sets: Array.from({ length: e.sets }, () => ({ reps: e.reps, load: e.load, done: false }))
		}))
	};
}

export function setsDone(sets: WorkoutSet[]): number {
	return sets.filter((s) => s.done).length;
}

export function workoutSetsDone(workout: Workout): number {
	return workout.exercises.reduce((total, e) => total + setsDone(e.sets), 0);
}

/**
 * Whether a filed session counts as training: it must be finished and have at
 * least one set ticked. The single source of truth for "did this happen?", so
 * the week strip, today card, progress and adherence all agree.
 */
export function countsAsTraining(workout: Workout): boolean {
	return workout.finishedAt !== null && workoutSetsDone(workout) > 0;
}

export function workoutSetsPlanned(workout: Workout): number {
	return workout.exercises.reduce((total, e) => total + e.sets.length, 0);
}

/** Load actually moved: reps times load, over the sets that were ticked. */
export function workoutVolume(workout: Workout): number {
	return workout.exercises.reduce(
		(total, e) => total + e.sets.filter((s) => s.done).reduce((sum, s) => sum + s.reps * s.load, 0),
		0
	);
}

/**
 * How long the session has run, measured from the clock rather than counted in
 * memory, so leaving the screen does not lose time.
 */
export function elapsedSeconds(workout: Workout, now: number): number {
	const end = workout.finishedAt ?? now;
	return Math.max(0, Math.floor((end - workout.startedAt) / 1000));
}

export function currentExercise(workout: Workout): WorkoutExercise | undefined {
	return workout.exercises[workout.exerciseIndex];
}

/** m:ss, for the rest timer, where an hour is never in play. */
export function formatClock(seconds: number): string {
	const safe = Math.max(0, Math.floor(seconds));
	return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/** h:mm:ss, for a session that may well pass the hour. */
export function formatDuration(seconds: number): string {
	const safe = Math.max(0, Math.floor(seconds));
	const mm = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
	return `${Math.floor(safe / 3600)}:${mm}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * What this movement went at last time, so the first set is not a guess.
 * The newest finished workout that logged it wins.
 */
export function lastPerformance(
	workouts: Workout[],
	name: string
): { reps: number; load: number } | null {
	for (let i = workouts.length - 1; i >= 0; i--) {
		const exercise = workouts[i]?.exercises.find((e) => e.name === name);
		const set = exercise?.sets.find((s) => s.done);
		if (set) return { reps: set.reps, load: set.load };
	}
	return null;
}
