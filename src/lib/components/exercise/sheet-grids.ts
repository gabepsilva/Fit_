/**
 * The two tables' column tracks, shared by each header and its rows so they
 * cannot drift apart.
 *
 * A `.ts` module, not a `<script module>`, because the typed lint rules cannot
 * see exports across `.svelte` files.
 */

/** The routine sheet: movement, sets, reps, load. */
export const SHEET_GRID = 'grid grid-cols-[1fr_1.75rem_2rem_2.75rem] items-center gap-1.5';

/** A session's set list: number, reps, load, done. */
export const SET_GRID = 'grid grid-cols-[2rem_1fr_1fr_2.5rem] gap-2';
