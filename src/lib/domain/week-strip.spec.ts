import { describe, expect, it } from 'vitest';
import { addDaysISO, startOfWeek, todayISO, weekdayShort } from './utils';
import {
	dayStripAccessibleLabel,
	dayStripLabel,
	dayStripRange,
	loggedMarksText
} from './week-strip';

// A month-name fixture independent of week-strip.ts's own (private) lookup,
// so these expectations don't just restate the implementation.
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
];
function monthShort(iso: string): string {
	return MONTHS_SHORT[Number(iso.slice(5, 7)) - 1] ?? '';
}

describe('loggedMarksText', () => {
	it('reports nothing logged when all three are false', () => {
		expect(loggedMarksText(false, false, false)).toBe('nothing logged');
	});

	it('names food alone', () => {
		expect(loggedMarksText(true, false, false)).toBe('food logged');
	});

	it('names exercise alone', () => {
		expect(loggedMarksText(false, true, false)).toBe('exercise logged');
	});

	it('names weight alone', () => {
		expect(loggedMarksText(false, false, true)).toBe('weight logged');
	});

	it('lists food and weight in order when exercise is missing', () => {
		expect(loggedMarksText(true, false, true)).toBe('food, weight logged');
	});

	it('lists all three in food, exercise, weight order', () => {
		expect(loggedMarksText(true, true, true)).toBe('food, exercise, weight logged');
	});
});

describe('dayStripRange', () => {
	it('spans 38 days: 30 back through 7 forward, inclusive', () => {
		const today = todayISO();
		const range = dayStripRange(today);
		expect(range).toHaveLength(38);
		expect(range[0]).toBe(addDaysISO(today, -30));
		expect(range[range.length - 1]).toBe(addDaysISO(today, 7));
	});

	it('includes today', () => {
		const today = todayISO();
		expect(dayStripRange(today)).toContain(today);
	});
});

describe('dayStripLabel', () => {
	it('labels today as "Xxx N", the same as any other day', () => {
		const today = todayISO();
		expect(dayStripLabel(today)).toMatch(/^\w{3} \d{1,2}$/);
		expect(dayStripLabel(today)).not.toBe('Today');
	});

	it('labels an out-of-week day as "Xxx N"', () => {
		const today = todayISO();
		const farBack = addDaysISO(today, -20);
		expect(dayStripLabel(farBack)).toMatch(/^\w{3} \d{1,2}$/);
	});

	it('labels a day 30 days back as "Xxx N"', () => {
		const today = todayISO();
		const thirtyBack = addDaysISO(today, -30);
		expect(dayStripLabel(thirtyBack)).toMatch(/^\w{3} \d{1,2}$/);
	});

	// A fixed Wednesday, not the real today, used only to pin week boundaries.
	const midWeek = '2024-01-10';

	it('labels the first day of the current week as "Xxx N", not bare weekday', () => {
		const weekStart = startOfWeek(midWeek);
		expect(dayStripLabel(weekStart)).toBe(
			`${weekdayShort(weekStart)} ${Number(weekStart.slice(8, 10))}`
		);
	});

	it('labels the last day of the current week as "Xxx N", not bare weekday', () => {
		const weekEnd = addDaysISO(startOfWeek(midWeek), 6);
		expect(dayStripLabel(weekEnd)).toBe(`${weekdayShort(weekEnd)} ${Number(weekEnd.slice(8, 10))}`);
	});

	it('labels the day just before the current week by weekday and date', () => {
		const dayBeforeWeek = addDaysISO(startOfWeek(midWeek), -1);
		expect(dayStripLabel(dayBeforeWeek)).toMatch(/^\w{3} \d{1,2}$/);
	});

	it('labels the day just after the current week by weekday and date', () => {
		const dayAfterWeek = addDaysISO(startOfWeek(midWeek), 7);
		expect(dayStripLabel(dayAfterWeek)).toMatch(/^\w{3} \d{1,2}$/);
	});
});

describe('dayStripAccessibleLabel', () => {
	it('leads with "Today" and includes the date label and logged marks', () => {
		const today = todayISO();
		expect(dayStripAccessibleLabel(today, 'food logged', true)).toBe(
			`Today, ${dayStripLabel(today)} ${monthShort(today)}, food logged`
		);
	});

	it('omits "Today" for a day that is not today', () => {
		const yesterday = addDaysISO(todayISO(), -1);
		expect(dayStripAccessibleLabel(yesterday, 'nothing logged', false)).toBe(
			`${dayStripLabel(yesterday)} ${monthShort(yesterday)}, nothing logged`
		);
	});

	it('reflects "nothing logged" when nothing was logged', () => {
		const today = todayISO();
		expect(dayStripAccessibleLabel(today, 'nothing logged', true)).toContain('nothing logged');
	});

	// April 30 and May 1, 2024 are a Tuesday and a Wednesday: a month
	// boundary the visible `dayStripLabel` already tells apart on its own
	// (different day-of-month), unlike the Feb/Mar overlap below.
	it('labels a month boundary distinctly: "Tue 30" then "Wed 1"', () => {
		expect(dayStripLabel('2024-04-30')).toBe('Tue 30');
		expect(dayStripLabel('2024-05-01')).toBe('Wed 1');
		expect(dayStripAccessibleLabel('2024-04-30', 'nothing logged', false)).toBe(
			'Tue 30 Apr, nothing logged'
		);
		expect(dayStripAccessibleLabel('2024-05-01', 'nothing logged', false)).toBe(
			'Wed 1 May, nothing logged'
		);
	});

	// Feb 5 and Mar 5, 2027 are both Fridays, so `dayStripLabel` alone ("Fri 5")
	// collides for these two in-range days — exactly the case a strict DOM
	// query (or a screen reader) cannot tell apart without the month.
	it('stays unique across the whole 38-day range even when Feb and Mar overlap', () => {
		const today = '2027-03-05';
		const range = dayStripRange(today);

		const visibleLabels = range.map((iso) => dayStripLabel(iso));
		expect(new Set(visibleLabels).size).toBeLessThan(visibleLabels.length);

		const accessibleLabels = range.map((iso) =>
			dayStripAccessibleLabel(iso, 'nothing logged', iso === today)
		);
		expect(new Set(accessibleLabels).size).toBe(accessibleLabels.length);
	});
});
