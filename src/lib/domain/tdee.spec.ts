import { describe, expect, it } from 'vitest';
import { emptyProfile } from './demo-seed';
import { FOOD_BY_ID, scaleFood } from './foods';
import {
	adaptiveTdee,
	calmWeeks,
	computeTargets,
	estimatedTdee,
	goalDelta,
	latestWeight,
	loggedDatesSet,
	microTargets,
	mifflinStJeor,
	nutritionForDay,
	rollingAverages
} from './tdee';
import type { LogItem, Meal, Profile, WeightEntry } from './types';
import { addDaysISO, uid } from './utils';

const END = '2026-06-30';

function entry(date: string, foodId: string, servings: number, meal: Meal = 'lunch'): LogItem {
	const food = FOOD_BY_ID[foodId];
	if (!food) throw new Error(`test fixture references unknown food: ${foodId}`);
	const scaled = scaleFood(food, servings);
	return {
		id: uid('l-'),
		foodId,
		date,
		meal,
		servings,
		source: 'manual',
		name: scaled.name,
		kcal: scaled.kcal,
		protein: scaled.protein,
		carbs: scaled.carbs,
		fat: scaled.fat,
		micros: scaled.micros,
		provenance: scaled.provenance,
		servingLabel: scaled.servingLabel,
		brand: scaled.brand
	};
}

function profileWith(overrides: Partial<Profile> = {}): Profile {
	return { ...emptyProfile({ name: 'Test' }), ...overrides };
}

/** `days` consecutive days ending at END, each logged with the same food. */
function loggedRun(days: number, foodId = 'chicken-breast', servings = 3): LogItem[] {
	return Array.from({ length: days }, (_, i) =>
		entry(addDaysISO(END, -(days - 1 - i)), foodId, servings)
	);
}

function weighInRun(count: number, startKg: number, kgPerReading: number): WeightEntry[] {
	return Array.from({ length: count }, (_, i) => ({
		id: uid('w-'),
		// Every other day, so `count` readings span roughly 2*count days.
		date: addDaysISO(END, -((count - 1 - i) * 2)),
		kg: startKg + i * kgPerReading
	}));
}

describe('mifflinStJeor', () => {
	it('adds the male constant', () => {
		const base = 10 * 80 + 6.25 * 180 - 5 * 30;
		expect(mifflinStJeor({ sex: 'male', age: 30, heightCm: 180 }, 80)).toBe(base + 5);
	});

	it('subtracts the female constant', () => {
		const base = 10 * 65 + 6.25 * 165 - 5 * 30;
		expect(mifflinStJeor({ sex: 'female', age: 30, heightCm: 165 }, 65)).toBe(base - 161);
	});

	it('uses a midpoint constant for other', () => {
		const base = 10 * 70 + 6.25 * 170 - 5 * 30;
		expect(mifflinStJeor({ sex: 'other', age: 30, heightCm: 170 }, 70)).toBe(base - 78);
	});
});

describe('latestWeight', () => {
	it('returns the most recent reading regardless of array order', () => {
		expect(
			latestWeight([
				{ id: 'b', date: '2026-02-01', kg: 71 },
				{ id: 'a', date: '2026-01-01', kg: 75 }
			])
		).toBe(71);
	});

	it('falls back when there are no readings', () => {
		expect(latestWeight([], 66)).toBe(66);
	});
});

describe('estimatedTdee', () => {
	it('scales the basal rate by the activity factor', () => {
		const sedentary = estimatedTdee(profileWith({ activity: 'sedentary' }));
		const active = estimatedTdee(profileWith({ activity: 'active' }));
		expect(active).toBeGreaterThan(sedentary);
	});
});

describe('goalDelta', () => {
	it('cuts for losing', () => {
		expect(goalDelta('lose')).toBe(-400);
	});

	it('adds for gaining', () => {
		expect(goalDelta('gain')).toBe(250);
	});

	it('applies a gentler cut on GLP-1', () => {
		expect(goalDelta('glp1')).toBe(-250);
	});

	it('leaves maintenance alone', () => {
		expect(goalDelta('maintain')).toBe(0);
	});
});

describe('nutritionForDay', () => {
	it('sums every entry on the day', () => {
		const log = [entry('2026-06-01', 'egg-large', 2), entry('2026-06-01', 'egg-large', 1)];
		const one = nutritionForDay([entry('2026-06-01', 'egg-large', 1)], '2026-06-01');
		expect(nutritionForDay(log, '2026-06-01').kcal).toBe(one.kcal * 3);
	});

	it('counts the entries', () => {
		const log = [entry('2026-06-01', 'egg-large', 2), entry('2026-06-01', 'coffee', 1)];
		expect(nutritionForDay(log, '2026-06-01').count).toBe(2);
	});

	it('returns zeros for an unlogged day rather than throwing', () => {
		expect(nutritionForDay([], '2026-06-01')).toMatchObject({ kcal: 0, protein: 0, count: 0 });
	});

	it('ignores entries from other days', () => {
		const log = [entry('2026-06-01', 'egg-large', 2)];
		expect(nutritionForDay(log, '2026-06-02').kcal).toBe(0);
	});
});

describe('rollingAverages', () => {
	it('averages over logged days only, never treating a miss as zero', () => {
		const oneDay = nutritionForDay([entry(END, 'chicken-breast', 3)], END);
		// Two logged days inside a seven-day window: the average must equal a
		// single day's intake, not two-sevenths of it.
		const log = [entry(END, 'chicken-breast', 3), entry(addDaysISO(END, -3), 'chicken-breast', 3)];
		const { avg, loggedDays } = rollingAverages(log, 7, END);
		expect(loggedDays).toBe(2);
		expect(Math.round(avg.kcal)).toBe(Math.round(oneDay.kcal));
	});

	it('reports zero logged days for an empty log', () => {
		expect(rollingAverages([], 7, END).loggedDays).toBe(0);
	});
});

describe('loggedDatesSet', () => {
	it('collapses repeated dates', () => {
		const log = [entry('2026-06-01', 'coffee', 1), entry('2026-06-01', 'egg-large', 1)];
		expect(loggedDatesSet(log).size).toBe(1);
	});
});

describe('adaptiveTdee', () => {
	it('falls back to the formula without enough history', () => {
		const p = profileWith({ log: loggedRun(3), weights: weighInRun(2, 80, -0.1) });
		const result = adaptiveTdee(p, END);
		expect(result.usingAdaptive).toBe(false);
		expect(result.inferred).toBe(result.fallback);
	});

	it('switches to the inferred burn once there is enough history', () => {
		const p = profileWith({ log: loggedRun(14), weights: weighInRun(8, 80, -0.15) });
		expect(adaptiveTdee(p, END).usingAdaptive).toBe(true);
	});

	it('infers a burn above intake when weight is falling', () => {
		const p = profileWith({ log: loggedRun(14), weights: weighInRun(8, 80, -0.15) });
		const result = adaptiveTdee(p, END);
		expect(result.inferred).toBeGreaterThan(result.avgIntake);
	});

	it('reports a negative weekly trend when weight is falling', () => {
		const p = profileWith({ log: loggedRun(14), weights: weighInRun(8, 80, -0.15) });
		expect(adaptiveTdee(p, END).kgPerWeek).toBeLessThan(0);
	});

	it('clamps the inferred value into a physiologically plausible band', () => {
		// An implausible crash in weight would otherwise infer an absurd burn.
		const p = profileWith({ log: loggedRun(14), weights: weighInRun(8, 120, -3) });
		expect(adaptiveTdee(p, END).inferred).toBeLessThanOrEqual(4200);
	});
});

describe('computeTargets', () => {
	it('honours a manual calorie override', () => {
		const targets = computeTargets(profileWith({ calorieOverride: 1800 }));
		expect(targets.kcal).toBe(1800);
		expect(targets.source).toBe('override');
	});

	it('reports the formula source before there is history', () => {
		expect(computeTargets(profileWith()).source).toBe('formula');
	});

	it('asks for more protein on GLP-1', () => {
		const kg = [{ id: 'w', date: END, kg: 80 }];
		const plain = computeTargets(profileWith({ weights: kg }));
		const glp1 = computeTargets(profileWith({ weights: kg, glp1: true }));
		expect(glp1.protein).toBeGreaterThan(plain.protein);
	});

	it('never sets a calorie target below the floor', () => {
		const tiny = profileWith({ age: 90, heightCm: 140, goal: 'lose' });
		expect(computeTargets(tiny).kcal).toBeGreaterThanOrEqual(1200);
	});

	it('keeps carbohydrates non-negative when protein is steered high', () => {
		const targets = computeTargets(profileWith({ proteinOverride: 400, calorieOverride: 1200 }));
		expect(targets.carbs).toBeGreaterThanOrEqual(0);
	});

	it('honours a fibre override', () => {
		expect(computeTargets(profileWith({ fiberOverride: 45 })).fiber).toBe(45);
	});
});

describe('calmWeeks', () => {
	it('counts a week with four logged days', () => {
		const log = [0, 1, 2, 3].map((i) => entry(addDaysISO('2026-06-01', i), 'coffee', 1));
		expect(calmWeeks(log, 4, '2026-06-07')).toBe(1);
	});

	it('does not count a week with too few days', () => {
		const log = [0, 1].map((i) => entry(addDaysISO('2026-06-01', i), 'coffee', 1));
		expect(calmWeeks(log, 4, '2026-06-07')).toBe(0);
	});

	it('is zero for an empty log', () => {
		expect(calmWeeks([], 4, END)).toBe(0);
	});

	it('does not reset on a missed week — earlier calm weeks still count', () => {
		const first = [0, 1, 2, 3].map((i) => entry(addDaysISO('2026-06-01', i), 'coffee', 1));
		const later = [0, 1, 2, 3].map((i) => entry(addDaysISO('2026-06-15', i), 'coffee', 1));
		expect(calmWeeks([...first, ...later], 4, '2026-06-21')).toBe(2);
	});
});

describe('microTargets', () => {
	it('sets a higher iron target for women', () => {
		expect(microTargets(profileWith({ sex: 'female' })).iron).toBeGreaterThan(
			microTargets(profileWith({ sex: 'male' })).iron
		);
	});

	it('sets a higher fibre target for men', () => {
		expect(microTargets(profileWith({ sex: 'male' })).fiber).toBe(38);
	});
});
