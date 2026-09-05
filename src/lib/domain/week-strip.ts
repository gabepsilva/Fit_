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
 * ("Sat 5"), the same format for every day including today. Today's pill
 * carries the word "Today" in its aria-label instead, via `todayAriaLabel`.
 */
export function dayStripLabel(iso: string): string {
	const dayOfMonth = Number(iso.slice(8, 10));
	return `${weekdayShort(iso)} ${dayOfMonth}`;
}

/**
 * The accessible-name override for today's pill. Its visible text is the
 * same "Xxx N" format as every other day, so this is what keeps "Today" in
 * the name screen readers announce.
 */
export function todayAriaLabel(iso: string, marksText: string): string {
	return `Today, ${dayStripLabel(iso)}, ${marksText}`;
}
