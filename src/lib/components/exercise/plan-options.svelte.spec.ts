import { describe, expect, it } from 'vitest';
import type { CalendarWeek } from '$lib/domain/training-plan';
import { REST_WEEK, type PlannedWeek, type Routine } from '$lib/domain/types';
import { assignedCount, plannedOption, planOptions } from './plan-options';

function routine(id: string, name: string, freq = 3): Routine {
	return { id, name, freq, exercises: [] };
}

const ROUTINES = [routine('push', 'Chest & Shoulders'), routine('legs', 'Legs', 2)];
const OPTIONS = planOptions(ROUTINES);
const PLAN: PlannedWeek[] = [{ year: 2026, week: 5, routineId: 'legs' }];

const WEEK: CalendarWeek = {
	week: 5,
	month: 0,
	startISO: '2026-02-02',
	endISO: '2026-02-08',
	label: 'Feb 2–8'
};

describe('planOptions', () => {
	it('offers every routine plus a rest week', () => {
		expect(OPTIONS.map((option) => option.id)).toEqual(['push', 'legs', REST_WEEK]);
	});

	it('names the rest week and says it is deliberate', () => {
		expect(planOptions([]).at(-1)).toMatchObject({
			name: 'Rest week',
			note: 'Nothing scheduled, on purpose.'
		});
	});

	it('says a routine covers the whole week', () => {
		expect(OPTIONS[0]?.note).toBe('Every session that week');
	});

	it('carries the routine initial and the days its frequency lands on', () => {
		expect(OPTIONS[1]).toMatchObject({ letter: 'L', days: [0, 3] });
	});

	it('marks the rest week with a dash rather than an initial', () => {
		expect(OPTIONS.at(-1)?.letter).toBe('—');
	});

	it('leaves a rest week without training days', () => {
		expect(OPTIONS.at(-1)?.days).toEqual([]);
	});

	it('gives each routine its own tone', () => {
		expect(OPTIONS[0]?.tone.ink).not.toBe(OPTIONS[1]?.tone.ink);
	});
});

describe('plannedOption', () => {
	it('finds what a week was planned as', () => {
		expect(plannedOption(OPTIONS, PLAN, 2026, 5)?.name).toBe('Legs');
	});

	it('returns nothing for a week that was never assigned', () => {
		expect(plannedOption(OPTIONS, PLAN, 2026, 6)).toBeUndefined();
	});

	it('returns nothing for a week planned in a different year', () => {
		expect(plannedOption(OPTIONS, PLAN, 2025, 5)).toBeUndefined();
	});
});

describe('assignedCount', () => {
	it('counts only the weeks that name something', () => {
		expect(assignedCount([WEEK, { ...WEEK, week: 6 }], PLAN, 2026)).toBe(1);
	});

	it('ignores assignments made in another year', () => {
		expect(assignedCount([WEEK], PLAN, 2025)).toBe(0);
	});
});
