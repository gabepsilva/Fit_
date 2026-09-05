import { describe, expect, it } from 'vitest';
import { addDaysISO, startOfWeek, todayISO, weekdayShort } from './utils';
import { dayStripLabel, dayStripRange, loggedMarksText } from './week-strip';

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
	it('labels today as "Today"', () => {
		const today = todayISO();
		expect(dayStripLabel(today, today)).toBe('Today');
	});

	it('labels an out-of-week day as "Xxx N"', () => {
		const today = todayISO();
		const farBack = addDaysISO(today, -20);
		expect(dayStripLabel(farBack, today)).toMatch(/^\w{3} \d{1,2}$/);
	});

	it('labels a day 30 days back as "Xxx N"', () => {
		const today = todayISO();
		const thirtyBack = addDaysISO(today, -30);
		expect(dayStripLabel(thirtyBack, today)).toMatch(/^\w{3} \d{1,2}$/);
	});

	// A fixed Wednesday, not the real today, so these boundary checks never
	// land on "today" itself (which always overrides the weekday/date label).
	const midWeek = '2024-01-10';

	it('labels the first day of the current week by weekday, not by date', () => {
		const weekStart = startOfWeek(midWeek);
		expect(dayStripLabel(weekStart, midWeek)).toBe(weekdayShort(weekStart));
	});

	it('labels the last day of the current week by weekday, not by date', () => {
		const weekEnd = addDaysISO(startOfWeek(midWeek), 6);
		expect(dayStripLabel(weekEnd, midWeek)).toBe(weekdayShort(weekEnd));
	});

	it('labels the day just before the current week by date, not by weekday', () => {
		const dayBeforeWeek = addDaysISO(startOfWeek(midWeek), -1);
		expect(dayStripLabel(dayBeforeWeek, midWeek)).not.toBe(weekdayShort(dayBeforeWeek));
		expect(dayStripLabel(dayBeforeWeek, midWeek)).toMatch(/^\w{3} \d{1,2}$/);
	});

	it('labels the day just after the current week by date, not by weekday', () => {
		const dayAfterWeek = addDaysISO(startOfWeek(midWeek), 7);
		expect(dayStripLabel(dayAfterWeek, midWeek)).not.toBe(weekdayShort(dayAfterWeek));
		expect(dayStripLabel(dayAfterWeek, midWeek)).toMatch(/^\w{3} \d{1,2}$/);
	});
});
