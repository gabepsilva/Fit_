/**
 * Routines are told apart by color on the planner, where a week is a chip too
 * small for a name. The palette is fixed and assigned by position rather than
 * stored on the routine: a color picker is a decision to make someone take,
 * and three routines in a rotation never collide anyway.
 */
export type RoutineTone = {
	/** Filled: the chip for a selected week or today's day. */
	solid: string;
	/** Washed: the background of a week that is planned but not selected. */
	tint: string;
	/** The color on its own, for a letter or a dot. */
	ink: string;
};

const TONES: readonly RoutineTone[] = [
	{ solid: 'bg-primary text-primary-foreground', tint: 'bg-primary/10', ink: 'text-primary' },
	// Sage is the lightest of the three and cannot carry pale text at 2.7:1: it
	// takes the ink color on its own fill, and lends only its tint to a letter.
	{ solid: 'bg-sage-soft text-foreground', tint: 'bg-sage-soft/25', ink: 'text-foreground' },
	{
		solid: 'bg-destructive text-destructive-foreground',
		tint: 'bg-destructive/10',
		ink: 'text-destructive'
	}
];

/** A rest week is not a fourth routine, so it gets the quiet non-color instead. */
export const REST_TONE: RoutineTone = {
	solid: 'bg-muted text-foreground/70',
	tint: 'bg-muted/40',
	ink: 'text-muted-foreground'
};

export function routineTone(index: number): RoutineTone {
	if (index < 0) return REST_TONE;
	return TONES[index % TONES.length] ?? REST_TONE;
}

/** The initial that stands in for a routine on the year grid. */
export function routineLetter(name: string): string {
	return name.trim().charAt(0).toUpperCase() || '·';
}
