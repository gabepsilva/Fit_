import { describe, expect, it } from 'vitest';
import {
	addDaysISO,
	lastNDates,
	monthDay,
	parseISODate,
	round1,
	startOfWeek,
	todayISO,
	uid,
	weekdayLong,
	weekdayShort
} from './utils';

describe('todayISO', () => {
	it('formats a date as YYYY-MM-DD in local time', () => {
		expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05');
	});

	it('zero-pads single-digit months and days', () => {
		expect(todayISO(new Date(2026, 8, 9))).toBe('2026-09-09');
	});
});

describe('parseISODate', () => {
	it('reads a date in local time, not UTC', () => {
		const d = parseISODate('2026-03-01');
		expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 1]);
	});

	it('falls back to the epoch rather than producing an Invalid Date', () => {
		expect(Number.isNaN(parseISODate('not-a-date').getTime())).toBe(false);
	});

	it('falls back when the string has too few parts', () => {
		expect(Number.isNaN(parseISODate('2026').getTime())).toBe(false);
	});
});

describe('addDaysISO', () => {
	it('moves forward across a month boundary', () => {
		expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01');
	});

	it('moves backward across a year boundary', () => {
		expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31');
	});

	it('handles a leap day', () => {
		expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29');
	});

	it('returns the same date for a zero offset', () => {
		expect(addDaysISO('2026-06-15', 0)).toBe('2026-06-15');
	});
});

describe('startOfWeek', () => {
	it('treats Monday as the first day', () => {
		// 2026-01-07 is a Wednesday.
		expect(startOfWeek('2026-01-07')).toBe('2026-01-05');
	});

	it('maps Sunday back to the Monday six days earlier', () => {
		// 2026-01-11 is a Sunday.
		expect(startOfWeek('2026-01-11')).toBe('2026-01-05');
	});

	it('leaves a Monday where it is', () => {
		expect(startOfWeek('2026-01-05')).toBe('2026-01-05');
	});
});

describe('lastNDates', () => {
	it('returns n dates ending on the given day, oldest first', () => {
		expect(lastNDates(3, '2026-01-03')).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
	});

	it('returns an empty list for a zero-length window', () => {
		expect(lastNDates(0, '2026-01-03')).toEqual([]);
	});

	it('defaults the window to end today', () => {
		expect(lastNDates(1).at(-1)).toBe(todayISO());
	});
});

describe('weekday and month formatting', () => {
	it('names the short weekday', () => {
		expect(weekdayShort('2026-01-05')).toBe('Mon');
	});

	it('names the long weekday', () => {
		expect(weekdayLong('2026-01-11')).toBe('Sunday');
	});

	it('renders a short month and day', () => {
		expect(monthDay('2026-01-05')).toMatch(/Jan/);
	});
});

describe('round1', () => {
	it('keeps one decimal place', () => {
		expect(round1(1.26)).toBe(1.3);
	});

	it('leaves whole numbers alone', () => {
		expect(round1(4)).toBe(4);
	});
});

describe('uid', () => {
	it('applies the prefix', () => {
		expect(uid('l-')).toMatch(/^l-/);
	});

	it('does not repeat within a batch', () => {
		const ids = new Set(Array.from({ length: 200 }, () => uid()));
		expect(ids.size).toBe(200);
	});
});
