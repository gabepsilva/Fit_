import { describe, expect, it } from 'vitest';
import {
	calendarWeeks,
	firstMondayISO,
	MONTHS_LONG,
	plannedRoutineId,
	plannedWeekCount,
	seedTrainingPlan,
	trainingDays,
	WEEKDAYS,
	weekOf,
	weekdayIndex,
	WEEKS_IN_YEAR
} from './training-plan';
import { REST_WEEK, type PlannedWeek } from './types';

/** 2026 opens on a Thursday, so its training year starts on 5 January. */
const LATE_START = 2026;
/** 2024 opens on a Monday, so week 1 is January 1 and the tail runs long. */
const MONDAY_START = 2024;

describe('the calendar', () => {
	it('names twelve months and seven days, Monday first', () => {
		expect(MONTHS_LONG).toHaveLength(12);
		expect(MONTHS_LONG[0]).toBe('January');
		expect(WEEKDAYS).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
	});

	it('starts a year that opens on a Monday on the first of January', () => {
		expect(firstMondayISO(MONDAY_START)).toBe('2024-01-01');
	});

	it('waits for the first Monday in a year that does not', () => {
		expect(firstMondayISO(LATE_START)).toBe('2026-01-05');
		expect(firstMondayISO(2025)).toBe('2025-01-06');
	});
});

describe('the weeks of a training year', () => {
	it('is fifty-two whole weeks', () => {
		const weeks = calendarWeeks(LATE_START);
		expect(weeks).toHaveLength(WEEKS_IN_YEAR);
		expect(WEEKS_IN_YEAR).toBe(52);
	});

	it('numbers the weeks from one', () => {
		const weeks = calendarWeeks(LATE_START);
		expect(weeks[0]?.week).toBe(1);
		expect(weeks.at(-1)?.week).toBe(52);
	});

	it('begins on the first Monday and runs seven days at a time', () => {
		const weeks = calendarWeeks(LATE_START);
		expect(weeks[0]?.startISO).toBe('2026-01-05');
		expect(weeks[0]?.endISO).toBe('2026-01-11');
		expect(weeks[1]?.startISO).toBe('2026-01-12');
	});

	it('files a week under the month it starts in', () => {
		const weeks = calendarWeeks(LATE_START);
		expect(weeks[0]?.month).toBe(0);
		expect(weeks.at(-1)?.month).toBe(11);
	});

	it('labels a week inside one month with a bare closing date', () => {
		expect(calendarWeeks(LATE_START)[0]?.label).toBe('Jan 5–11');
	});

	it('names the second month when a week straddles two of them', () => {
		expect(calendarWeeks(LATE_START)[3]?.label).toBe('Jan 26–Feb 1');
	});
});

describe('placing a date in the plan', () => {
	it('puts a date in the week it falls in', () => {
		expect(weekOf('2026-01-05')).toEqual({ year: 2026, week: 1 });
		expect(weekOf('2026-01-11')).toEqual({ year: 2026, week: 1 });
		expect(weekOf('2026-01-12')).toEqual({ year: 2026, week: 2 });
	});

	it('gives the days before the first Monday back to the year before', () => {
		expect(weekOf('2026-01-03')).toEqual({ year: 2025, week: 52 });
		expect(weekOf('2027-01-02')).toEqual({ year: 2026, week: 52 });
	});

	it('keeps the days after week fifty-two in week fifty-two', () => {
		// 2024 starts on a Monday, so its 52 weeks end on 29 December and two
		// days are left over rather than becoming a week 53.
		expect(weekOf('2024-12-29')).toEqual({ year: 2024, week: 52 });
		expect(weekOf('2024-12-31')).toEqual({ year: 2024, week: 52 });
	});

	it('numbers the weekdays from Monday', () => {
		expect(weekdayIndex('2026-01-05')).toBe(0);
		expect(weekdayIndex('2026-01-10')).toBe(5);
		expect(weekdayIndex('2026-01-11')).toBe(6);
	});
});

describe('the days a routine lands on', () => {
	it('spreads three sessions over Monday, Wednesday and Friday', () => {
		expect(trainingDays(3)).toEqual([0, 2, 4]);
	});

	it('gives as many days as there are sessions', () => {
		for (const freq of [1, 2, 4, 5, 6, 7]) {
			expect(trainingDays(freq)).toHaveLength(freq);
		}
	});

	it('spreads rather than stacking them at the front of the week', () => {
		expect(trainingDays(2)).toEqual([0, 3]);
		expect(trainingDays(4)).toEqual([0, 1, 3, 5]);
	});

	it('fills the week and no more when asked for too many', () => {
		expect(trainingDays(9)).toEqual([0, 1, 2, 3, 4, 5, 6]);
	});

	it('marks no days for none or fewer', () => {
		expect(trainingDays(0)).toEqual([]);
		expect(trainingDays(-3)).toEqual([]);
	});

	it('ignores a fraction of a session', () => {
		expect(trainingDays(3.9)).toEqual([0, 2, 4]);
	});
});

describe('reading a plan', () => {
	const plan: PlannedWeek[] = [
		{ year: 2026, week: 1, routineId: 'push' },
		{ year: 2026, week: 2, routineId: REST_WEEK },
		{ year: 2027, week: 1, routineId: 'legs' }
	];

	it('finds the routine planned for a week of a year', () => {
		expect(plannedRoutineId(plan, 2026, 1)).toBe('push');
		expect(plannedRoutineId(plan, 2027, 1)).toBe('legs');
	});

	it('finds nothing for a week nobody planned', () => {
		expect(plannedRoutineId(plan, 2026, 9)).toBeUndefined();
		expect(plannedRoutineId([], 2026, 1)).toBeUndefined();
	});

	it('counts only the weeks planned in the year asked about', () => {
		expect(plannedWeekCount(plan, 2026)).toBe(2);
		expect(plannedWeekCount(plan, 2027)).toBe(1);
		expect(plannedWeekCount(plan, 2028)).toBe(0);
	});
});

describe('seeding a plan for the rest of the year', () => {
	const ids = ['push', 'pull', 'legs'];

	it('plans nothing when there are no routines to plan', () => {
		expect(seedTrainingPlan([], 2026, '2026-01-05')).toEqual([]);
	});

	it('fills every week from the one it starts in to the end of the year', () => {
		const plan = seedTrainingPlan(ids, 2026, '2026-01-05');
		expect(plan).toHaveLength(WEEKS_IN_YEAR);
		expect(plan[0]?.week).toBe(1);
		expect(plan.at(-1)?.week).toBe(WEEKS_IN_YEAR);
		for (const week of plan) expect(week.year).toBe(2026);
	});

	it('gives each routine two weeks before moving on', () => {
		const plan = seedTrainingPlan(ids, 2026, '2026-01-05');
		expect(plan.slice(0, 7).map((p) => p.routineId)).toEqual([
			'push',
			'pull',
			'legs',
			'push',
			'pull',
			'legs',
			REST_WEEK
		]);
	});

	it('rests every seventh planned week', () => {
		const plan = seedTrainingPlan(ids, 2026, '2026-01-05');
		const rests = plan.filter((p) => p.routineId === REST_WEEK).map((p) => p.week);
		expect(rests).toEqual([7, 14, 21, 28, 35, 42, 49]);
	});

	it('starts from the week the plan was asked for, not from January', () => {
		const start = weekOf('2026-07-01').week;
		const plan = seedTrainingPlan(ids, 2026, '2026-07-01');
		expect(plan[0]?.week).toBe(start);
		expect(plan[0]?.routineId).toBe('push');
		expect(plan).toHaveLength(WEEKS_IN_YEAR - start + 1);
	});

	it('plans a different year from its first week', () => {
		const plan = seedTrainingPlan(ids, 2027, '2026-07-01');
		expect(plan[0]).toEqual({ year: 2027, week: 1, routineId: 'push' });
		expect(plan).toHaveLength(WEEKS_IN_YEAR);
	});

	it('defaults to this year, starting today', () => {
		const thisYear = new Date().getFullYear();
		const plan = seedTrainingPlan(['push']);
		expect(plan.length).toBeGreaterThan(0);
		for (const week of plan) expect(week.year).toBe(thisYear);
	});
});
