import { addDaysISO, todayISO, weekdayShort } from './utils';

/**
 * The accessible-name suffix for one day button in the week strip: which of
 * food, exercise and weight were logged that day, or "nothing logged" when
 * none were.
 */
export function loggedMarksText(food: boolean, exercise: boolean, weight: boolean): string {
	const parts: string[] = [];
	if (food) parts.push('food');
	if (exercise) parts.push('exercise');
	if (weight) parts.push('weight');
	if (parts.length === 0) return 'nothing logged';
	return `${parts.join(', ')} logged`;
}

/**
 * The day strip's range: 30 days back through 7 days forward from `today`,
 * inclusive (38 entries total, oldest first).
 */
export function dayStripRange(today = todayISO()): string[] {
	const start = addDaysISO(today, -30);
	const end = addDaysISO(today, 7);
	const out: string[] = [];
	for (let iso = start; iso <= end; iso = addDaysISO(iso, 1)) out.push(iso);
	return out;
}

/**
 * The visible label for one day strip pill: short weekday plus day-of-month
 * ("Sat 5"), the same format for every day including today. This alone is
 * not always unique across the 38-day range (a non-leap February and the
 * following March share both weekday and day-of-month 28 days apart), so it
 * is accompanied by a month in the accessible name; see `dayStripAccessibleLabel`.
 */
export function dayStripLabel(iso: string): string {
	const dayOfMonth = Number(iso.slice(8, 10));
	return `${weekdayShort(iso)} ${dayOfMonth}`;
}

// Three-letter month names packed into one string (JanFebMar...) rather
// than a 12-entry array literal: smaller once bundled, and a fixed-width
// slice still reads as directly as an array lookup.
const MONTHS_SHORT = 'JanFebMarAprMayJunJulAugSepOctNovDec';

/**
 * The short month name for one ISO date ("Feb"), parsed straight from the
 * string like `dayStripLabel`'s day-of-month, so `dayStripAccessibleLabel`
 * stays free of locale formatting. Kept local rather than in `utils.ts`
 * because this file's mutation lane requires every mutant killed, and the
 * array-bounds fallback a locale-agnostic lookup like `weekdayShort` uses
 * there is unreachable (a two-digit ISO month is always 1-12).
 */
function monthShort(iso: string): string {
	const monthIndex = Number(iso.slice(5, 7)) - 1;
	return MONTHS_SHORT.slice(monthIndex * 3, monthIndex * 3 + 3);
}

/**
 * The accessible name for one day strip pill: the visible weekday/date label
 * plus the short month (so it stays unique across the whole 38-day range,
 * unlike `dayStripLabel` alone, which shares "Fri 5" between a non-leap
 * February and the following March) and the logged marks, with a leading
 * "Today" for the current day since its visible text no longer carries that
 * word.
 */
export function dayStripAccessibleLabel(iso: string, marksText: string, isToday: boolean): string {
	const dateLabel = `${dayStripLabel(iso)} ${monthShort(iso)}`;
	return isToday ? `Today, ${dateLabel}, ${marksText}` : `${dateLabel}, ${marksText}`;
}
