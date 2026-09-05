import { addDaysISO, startOfWeek, todayISO, weekdayShort } from './utils';

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
 * The visible label for one day strip pill: "Today" for today, the short
 * weekday name for any other day within the current calendar week (Sun...Sat),
 * and "Xxx N" (short weekday plus day-of-month) for a day outside that week.
 */
export function dayStripLabel(iso: string, today = todayISO()): string {
	if (iso === today) return 'Today';
	const weekStart = startOfWeek(today);
	const weekEnd = addDaysISO(weekStart, 6);
	if (iso >= weekStart && iso <= weekEnd) return weekdayShort(iso);
	const dayOfMonth = Number(iso.slice(8, 10));
	return `${weekdayShort(iso)} ${dayOfMonth}`;
}
