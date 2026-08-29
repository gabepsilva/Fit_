import { plannedRoutineId, trainingDays } from '$lib/domain/training-plan';
import { REST_WEEK, type PlannedWeek, type Routine } from '$lib/domain/types';
import { REST_TONE, routineLetter, routineTone, type RoutineTone } from './routine-tone';

/** One thing a week can be set to, dressed for every screen that offers it. */
export type PlanOption = {
	id: string;
	name: string;
	letter: string;
	tone: RoutineTone;
	/** Weekday indexes the week trains on, Monday first. Empty for a rest week. */
	days: number[];
};

/**
 * The routines in rotation, plus the rest week that is a decision rather than a
 * gap. Every screen that assigns a week offers exactly this list, so it is built
 * in one place and a routine keeps its color wherever a week appears.
 */
export function planOptions(routines: Routine[]): PlanOption[] {
	const rest: PlanOption = {
		id: REST_WEEK,
		name: 'Rest week',
		// An em dash rather than an initial: a rest week is the absence of a
		// routine, and an "R" beside a "B" reads as one more of them.
		letter: '—',
		tone: REST_TONE,
		days: []
	};
	return [
		...routines.map((routine, index) => ({
			id: routine.id,
			name: routine.name,
			letter: routineLetter(routine.name),
			tone: routineTone(index),
			days: trainingDays(routine.freq)
		})),
		rest
	];
}

/** What a given week is set to, or undefined while it is still unassigned. */
export function plannedOption(
	options: PlanOption[],
	plan: PlannedWeek[],
	year: number,
	week: number
): PlanOption | undefined {
	const id = plannedRoutineId(plan, year, week);
	return options.find((option) => option.id === id);
}
