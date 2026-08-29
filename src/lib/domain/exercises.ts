import {
	DEFAULT_FORM_CUES,
	EXERCISE_LIBRARY,
	FORM_CUES,
	type RoutineTemplate
} from '$lib/domain/exercise-catalog';
import type { LibraryExercise, MuscleGroup, Routine, RoutineExercise } from '$lib/domain/types';

/**
 * Roughly how long a set costs, counting the rest after it. Used only to put a
 * number on "about 40 min" beside a routine, so it stays a constant here rather
 * than becoming a setting nobody would tune.
 */
const MINUTES_PER_SET = 3.2;

/** What a freshly added library exercise prescribes until someone edits it. */
const NEW_EXERCISE_SETS = 3;
const NEW_EXERCISE_REPS = 10;

const LIBRARY_BY_NAME: Readonly<Record<string, LibraryExercise>> = Object.fromEntries(
	EXERCISE_LIBRARY.map((e) => [e.name, e])
);

export function libraryExercise(name: string): LibraryExercise | undefined {
	return LIBRARY_BY_NAME[name];
}

/** The library, filtered to one muscle group. `null` means no filter. */
export function libraryFor(group: MuscleGroup | null): LibraryExercise[] {
	return EXERCISE_LIBRARY.filter((e) => group === null || e.group === group);
}

/**
 * What else trains the same thing — the answer to a machine already being
 * taken. The exercise being replaced is not offered as its own replacement.
 */
export function alternativesTo(name: string): LibraryExercise[] {
	const group = LIBRARY_BY_NAME[name]?.group;
	if (!group) return [];
	return EXERCISE_LIBRARY.filter((e) => e.group === group && e.name !== name);
}

export function formCues(name: string): readonly string[] {
	return FORM_CUES[name] ?? DEFAULT_FORM_CUES;
}

function routineSets(routine: Routine): number {
	return routine.exercises.reduce((total, e) => total + e.sets, 0);
}

/** The one-line arithmetic under a routine's name: how much, and how long. */
export function routineTotals(routine: Routine): {
	exercises: number;
	sets: number;
	minutes: number;
} {
	const sets = routineSets(routine);
	return { exercises: routine.exercises.length, sets, minutes: Math.round(sets * MINUTES_PER_SET) };
}

export type MuscleSection = {
	group: MuscleGroup;
	exercises: RoutineExercise[];
};

/**
 * The routine as the paper sheet reads it: muscle group down the left, its
 * movements beside it. Groups keep the order they first appear in, so the sheet
 * matches the order the session will run in.
 */
export function muscleSections(exercises: RoutineExercise[]): MuscleSection[] {
	const sections: MuscleSection[] = [];
	for (const exercise of exercises) {
		const section = sections.find((s) => s.group === exercise.group);
		if (section) section.exercises.push(exercise);
		else sections.push({ group: exercise.group, exercises: [exercise] });
	}
	return sections;
}

/** Turn library picks into routine rows. Unknown names are dropped, not guessed at. */
export function exercisesFromLibrary(names: string[]): RoutineExercise[] {
	return names.flatMap((name) => {
		const found = LIBRARY_BY_NAME[name];
		if (!found) return [];
		return [{ ...found, sets: NEW_EXERCISE_SETS, reps: NEW_EXERCISE_REPS, load: 0 }];
	});
}

/**
 * A template's routines, deep-copied. The templates are module constants shared
 * by every install; handing out references would let the first edit rewrite the
 * template for the next person who picks it.
 */
export function routinesFromTemplate(template: RoutineTemplate): Routine[] {
	return template.routines.map((r) => ({
		id: r.id,
		name: r.name,
		freq: r.freq,
		exercises: r.exercises.map((e) => ({ ...e }))
	}));
}

export function emptyRoutine(id: string): Routine {
	return { id, name: 'New routine', freq: 3, exercises: [] };
}

/** How far one tap on a stepper moves each field, in that field's own units. */
const FIELD_STEPS = { sets: 1, reps: 1, load: 2.5 } as const;

export type BumpField = keyof typeof FIELD_STEPS;

const FIELD_MINIMUM = { sets: 1, reps: 1, load: 0 } as const;

/** More than eight sets of one movement is a different plan, not a heavier one. */
const MAX_SETS = 8;

/**
 * One tap on a stepper: `direction` is +1 or -1 and the field decides the step
 * and the floor. Loads land on a plate-sized step and stop at bodyweight; sets
 * and reps stop at one, because a set of none is a removal, not a set.
 */
export function bumpField(field: BumpField, current: number, direction: number): number {
	const next = Math.round((current + FIELD_STEPS[field] * Math.sign(direction)) * 10) / 10;
	const floored = Math.max(FIELD_MINIMUM[field], next);
	return field === 'sets' ? Math.min(MAX_SETS, floored) : floored;
}

/** Zero load is bodyweight, which reads as an em dash rather than as a lift of nothing. */
export function formatLoad(load: number): string {
	return load === 0 ? '—' : String(load);
}
