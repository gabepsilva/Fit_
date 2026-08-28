import { FOOD_BY_ID, scaleFood } from './foods';
import type { LogItem, Meal, Profile, WeightEntry } from './types';
import { addDaysISO, todayISO, uid } from './utils';

type SeedEntry = {
	date: string;
	meal: Meal;
	foodId: string;
	servings: number;
	source?: LogItem['source'];
};

function item({ date, meal, foodId, servings, source = 'manual' }: SeedEntry): LogItem {
	const food = FOOD_BY_ID[foodId];
	if (!food) throw new Error(`Seed references unknown food: ${foodId}`);
	const scaled = scaleFood(food, servings);
	return {
		id: uid('l-'),
		foodId,
		date,
		meal,
		servings,
		source,
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

type DayPlan = [Meal, string, number][];

const TEMPLATES: DayPlan[] = [
	[
		['breakfast', 'egg-large', 2],
		['breakfast', 'sourdough', 1],
		['breakfast', 'coffee', 1],
		['lunch', 'greek-yogurt', 1],
		['lunch', 'blueberries', 0.5],
		['dinner', 'chicken-breast', 1.4],
		['dinner', 'brown-rice', 0.8],
		['dinner', 'broccoli', 1]
	],
	[
		['breakfast', 'oats', 1],
		['breakfast', 'milk-2', 0.75],
		['breakfast', 'banana', 0.5],
		['lunch', 'tuna-canned', 0.5],
		['lunch', 'mixed-greens', 1],
		['dinner', 'salmon', 1.3],
		['dinner', 'sweet-potato', 1],
		['snack', 'kind-bar', 1]
	],
	[
		['breakfast', 'greek-yogurt', 1],
		['breakfast', 'chia', 1],
		['breakfast', 'strawberries', 0.75],
		['lunch', 'chipotle-bowl', 0.55],
		['dinner', 'tofu-firm', 1.4],
		['dinner', 'brown-rice', 0.6],
		['dinner', 'broccoli', 1]
	],
	[
		['breakfast', 'cottage-cheese', 0.6],
		['breakfast', 'blueberries', 0.5],
		['lunch', 'turkey-breast', 1.2],
		['lunch', 'wheat-bread', 2],
		['dinner', 'pasta', 0.7],
		['dinner', 'chicken-breast', 1],
		['snack', 'apple', 1]
	],
	[
		['breakfast', 'egg-mcmuffin', 1],
		['breakfast', 'coffee', 1],
		['lunch', 'quest-bar', 1],
		['dinner', 'ground-turkey', 1.2],
		['dinner', 'black-beans', 0.4],
		['dinner', 'avocado', 0.5],
		['dinner', 'salsa', 2]
	]
];

/** Vary how a seeded entry was logged, so the journal looks lived-in. */
function seedSource(meal: Meal, dayIndex: number): LogItem['source'] {
	if (meal === 'breakfast' && dayIndex % 4 === 0) return 'text';
	if (meal === 'lunch' && dayIndex % 5 === 1) return 'photo';
	return 'manual';
}

function seedDay(date: string, dayIndex: number): LogItem[] {
	const plan = TEMPLATES[dayIndex % TEMPLATES.length] ?? [];
	// Portions wobble day to day; a perfectly repeated week would make the
	// adaptive-TDEE regression look unnaturally clean.
	const jitter = 0.9 + ((dayIndex * 17) % 7) * 0.02;
	return plan.map(([meal, foodId, servings]) =>
		item({
			date,
			meal,
			foodId,
			servings: Math.round(servings * jitter * 4) / 4,
			source: seedSource(meal, dayIndex)
		})
	);
}

export function buildAlexProfile(): Profile {
	const end = todayISO();
	const log: LogItem[] = [];
	const weights: WeightEntry[] = [];
	// Three missed days, because the app's whole point is that a miss is fine.
	const skipped = new Set([3, 9, 16]);

	for (let ago = 20; ago >= 0; ago--) {
		const dayIndex = 20 - ago;
		if (skipped.has(dayIndex)) continue;
		log.push(...seedDay(addDaysISO(end, -ago), dayIndex));
	}

	for (let ago = 20; ago >= 0; ago--) {
		if (ago % 2 === 1) continue;
		const date = addDaysISO(end, -ago);
		const trend = 78.15 - (20 - ago) * (1.0 / 20);
		const noise = ((ago * 13) % 5) * 0.08 - 0.16;
		weights.push({
			id: uid('w-'),
			date,
			kg: Math.round((trend + noise) * 100) / 100
		});
	}

	return {
		id: 'alex',
		name: 'Alex',
		goal: 'lose',
		glp1: false,
		sex: 'female',
		age: 34,
		heightCm: 168,
		activity: 'light',
		restrictions: ['nut-free'],
		log,
		weights,
		injections: [],
		calorieOverride: null,
		proteinOverride: null,
		fiberOverride: null
	};
}

/** Jordan eats the same vegetarian rotation every day — that is the point. */
const JORDAN_DAY: [Meal, string, number, LogItem['source']][] = [
	['breakfast', 'oats', 1, 'text'],
	['breakfast', 'oatly', 1, 'text'],
	['lunch', 'lentils', 0.75, 'manual'],
	['lunch', 'brown-rice', 0.5, 'manual'],
	['dinner', 'tofu-firm', 1.5, 'manual'],
	['dinner', 'quinoa', 0.75, 'manual'],
	['dinner', 'broccoli', 1, 'manual']
];

export function buildJordanProfile(): Profile {
	const end = todayISO();
	const log: LogItem[] = [];
	for (let ago = 10; ago >= 0; ago--) {
		if (ago === 4) continue;
		const date = addDaysISO(end, -ago);
		for (const [meal, foodId, servings, source] of JORDAN_DAY) {
			log.push({ ...item({ date, meal, foodId, servings, source }) });
		}
	}
	return {
		id: 'jordan',
		name: 'Jordan',
		goal: 'maintain',
		glp1: false,
		sex: 'male',
		age: 36,
		heightCm: 178,
		activity: 'moderate',
		restrictions: ['vegetarian'],
		log,
		weights: [
			{ id: uid('w-'), date: addDaysISO(end, -10), kg: 81.2 },
			{ id: uid('w-'), date: addDaysISO(end, -5), kg: 81.0 },
			{ id: uid('w-'), date: end, kg: 80.8 }
		],
		injections: [],
		calorieOverride: null,
		proteinOverride: null,
		fiberOverride: null
	};
}

export function emptyProfile(partial: Partial<Profile> & { name: string }): Profile {
	return {
		id: uid('p-'),
		goal: 'lose',
		glp1: false,
		sex: 'female',
		age: 32,
		heightCm: 168,
		activity: 'light',
		restrictions: [],
		log: [],
		weights: [],
		injections: [],
		calorieOverride: null,
		proteinOverride: null,
		fiberOverride: null,
		...partial
	};
}
