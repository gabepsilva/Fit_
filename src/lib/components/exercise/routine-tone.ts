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
	/** The color on its own, for a letter. */
	ink: string;
	/**
	 * The stroke of the dot marking a planned day. `ink` cannot stand in: it is a
	 * text color, and an empty span carrying one draws nothing at all.
	 *
	 * A stroke rather than a fill, and at full strength rather than washed out.
	 * A planned day has to be told from a trained one, which the strip marks with
	 * a solid dot, and the same color at lower opacity is the wrong way to do it:
	 * over the cream card, `bg-primary/40` measures 1.91:1 — barely above the
	 * 1.32:1 of the rest dot — and sage cannot reach 3:1 at any opacity, since
	 * even solid it only makes 2.79:1. Outline for planned and filled for done
	 * separates them by shape, so every tone keeps the contrast of its own color.
	 */
	dot: string;
};

const TONES: readonly RoutineTone[] = [
	{
		solid: 'bg-primary text-primary-foreground',
		tint: 'bg-primary/10',
		ink: 'text-primary',
		dot: 'border-primary'
	},
	// Sage is the lightest of the three and cannot carry pale text at 2.7:1: it
	// takes the ink color on its own fill, and lends only its tint to a letter.
	{
		solid: 'bg-sage-soft text-foreground',
		tint: 'bg-sage-soft/25',
		ink: 'text-foreground',
		dot: 'border-sage-soft'
	},
	{
		solid: 'bg-destructive text-destructive-foreground',
		tint: 'bg-destructive/10',
		ink: 'text-destructive',
		dot: 'border-destructive'
	}
];

/** A rest week is not a fourth routine, so it gets the quiet non-color instead. */
export const REST_TONE: RoutineTone = {
	solid: 'bg-muted text-foreground/70',
	tint: 'bg-muted/40',
	ink: 'text-muted-foreground',
	dot: 'border-muted-foreground'
};

export function routineTone(index: number): RoutineTone {
	if (index < 0) return REST_TONE;
	return TONES[index % TONES.length] ?? REST_TONE;
}

/** The initial that stands in for a routine on the year grid. */
export function routineLetter(name: string): string {
	return name.trim().charAt(0).toUpperCase() || '·';
}
