import { describe, expect, it } from 'vitest';
import { buildAlexProfile, buildJordanProfile, HOUSEHOLD_PARTNER } from './demo-seed';
import { FOOD_BY_ID } from './foods';
import { adaptiveTdee, loggedDatesSet } from './tdee';

describe('buildAlexProfile', () => {
	const alex = buildAlexProfile();

	it('seeds a log', () => {
		expect(alex.log.length).toBeGreaterThan(0);
	});

	it('only references catalog foods', () => {
		for (const item of alex.log) {
			expect(item.foodId && FOOD_BY_ID[item.foodId]).toBeTruthy();
		}
	});

	it('leaves gaps, because a missed day is the point', () => {
		expect(loggedDatesSet(alex.log).size).toBeLessThan(21);
	});

	it('seeds enough history for adaptive TDEE to engage', () => {
		expect(adaptiveTdee(alex).usingAdaptive).toBe(true);
	});

	it('seeds weigh-ins in ascending date order', () => {
		const dates = alex.weights.map((w) => w.date);
		expect([...dates].sort()).toEqual(dates);
	});

	it('varies how entries were logged', () => {
		expect(new Set(alex.log.map((i) => i.source)).size).toBeGreaterThan(1);
	});
});

describe('buildJordanProfile', () => {
	const jordan = buildJordanProfile();

	it('is vegetarian', () => {
		expect(jordan.restrictions).toContain('vegetarian');
	});

	it('states the same person the empty household profile does', () => {
		expect(jordan.name).toBe(HOUSEHOLD_PARTNER.name);
		expect(jordan.heightCm).toBe(HOUSEHOLD_PARTNER.heightCm);
	});

	it('seeds a log', () => {
		expect(jordan.log.length).toBeGreaterThan(0);
	});

	it('only references catalog foods', () => {
		for (const item of jordan.log) {
			expect(item.foodId && FOOD_BY_ID[item.foodId]).toBeTruthy();
		}
	});
});
