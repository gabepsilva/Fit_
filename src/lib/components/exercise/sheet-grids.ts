/**
 * The column tracks of the two tables in the exercise tab, each shared by a
 * header and the rows beneath it. A header that drifts from its rows stops
 * being a table and starts being four lists, and the drift is invisible until
 * a column is added.
 *
 * These live in a module rather than in either component's `<script module>`
 * because the typed lint rules cannot see exports across `.svelte` files, and
 * an untyped class string is exactly what this is meant to prevent.
 */

/** The routine sheet: movement, sets, reps, load. */
export const SHEET_GRID = 'grid grid-cols-[1fr_1.75rem_2rem_2.75rem] items-center gap-1.5';

/** A session's set list: number, reps, load, done. */
export const SET_GRID = 'grid grid-cols-[2rem_1fr_1fr_2.5rem] gap-2';
