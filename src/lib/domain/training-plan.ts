import { REST_WEEK, type PlannedWeek } from '$lib/domain/types';
import { addDaysISO, parseISODate, todayISO } from '$lib/domain/utils';

const MONTHS_SHORT = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
] as const;

export const MONTHS_LONG = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
] as const;

/** Monday first, because a training week starts where the plan does. */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/**
 * A training year is 52 whole weeks from the first Monday of January. It is not
 * ISO-8601 week numbering: the planner draws weeks as rows, so every row has to
 * be seven days long and belong to exactly one year, which a part week at
 * either end would break. The few days between the last week and New Year fall
 * into week 52.
 */
export const WEEKS_IN_YEAR = 52;

export type CalendarWeek = {
	/** 1-based, so it reads as "week 34" rather than as an index. */
	week: number;
	/** Month the week starts in, 0-based, which is the month it is filed under. */
	month: number;
	startISO: string;
	endISO: string;
	/** "Aug 17–23", or "Aug 31–Sep 6" when the week straddles two months. */
	label: string;
};

export function firstMondayISO(year: number): string {
	const jan1 = new Date(year, 0, 1);
	// getDay() is Sunday-based; this is the offset to the Monday on or after it.
	const offset = (8 - jan1.getDay()) % 7;
	return addDaysISO(`${year}-01-01`, offset);
}

export function calendarWeeks(year: number): CalendarWeek[] {
	const start = firstMondayISO(year);
	return Array.from({ length: WEEKS_IN_YEAR }, (_, i) => {
		const startISO = addDaysISO(start, i * 7);
		const endISO = addDaysISO(startISO, 6);
		const from = parseISODate(startISO);
		const to = parseISODate(endISO);
		const tail =
			from.getMonth() === to.getMonth()
				? String(to.getDate())
				: `${MONTHS_SHORT[to.getMonth()]} ${to.getDate()}`;
		return {
			week: i + 1,
			month: from.getMonth(),
			startISO,
			endISO,
			label: `${MONTHS_SHORT[from.getMonth()]} ${from.getDate()}–${tail}`
		};
	});
}

/**
 * Which planned week a date falls in. Days before the year's first Monday
 * belong to the last week of the year before, and the stray days after week 52
 * stay in week 52 rather than inventing a week 53.
 */
export function weekOf(iso: string): { year: number; week: number } {
	const year = parseISODate(iso).getFullYear();
	const start = parseISODate(firstMondayISO(year));
	const days = Math.floor((parseISODate(iso).getTime() - start.getTime()) / 86_400_000);
	if (days < 0) return { year: year - 1, week: WEEKS_IN_YEAR };
	return { year, week: Math.min(WEEKS_IN_YEAR, Math.floor(days / 7) + 1) };
}

/** Monday is 0, Sunday is 6 — the order the week strip draws. */
export function weekdayIndex(iso: string): number {
	return (parseISODate(iso).getDay() + 6) % 7;
}

/**
 * Which days of the week a routine lands on. Sessions are spread evenly rather
 * than stacked at the front, so three a week means Monday, Wednesday, Friday.
 */
export function trainingDays(freq: number): number[] {
	const count = Math.max(0, Math.min(7, Math.floor(freq)));
	return Array.from({ length: count }, (_, i) => Math.floor((i * 7) / count));
}

export function plannedRoutineId(
	plan: PlannedWeek[],
	year: number,
	week: number
): string | undefined {
	return plan.find((p) => p.year === year && p.week === week)?.routineId;
}

export function plannedWeekCount(plan: PlannedWeek[], year: number): number {
	return plan.filter((p) => p.year === year).length;
}

/**
 * A plan for the rest of the year, so a routine picked on day one has somewhere
 * to appear. Each routine gets two weeks before the next one, and every seventh
 * planned week is a rest week — the deload that a plan drawn by hand tends to
 * leave out.
 */
export function seedTrainingPlan(
	routineIds: string[],
	year = new Date().getFullYear(),
	fromISO = todayISO()
): PlannedWeek[] {
	if (routineIds.length === 0) return [];
	const cycle = [...routineIds, ...routineIds, REST_WEEK];
	const from = weekOf(fromISO).year === year ? weekOf(fromISO).week : 1;
	const out: PlannedWeek[] = [];
	for (let week = from; week <= WEEKS_IN_YEAR; week++) {
		const routineId = cycle[(week - from) % cycle.length];
		if (routineId) out.push({ year, week, routineId });
	}
	return out;
}
