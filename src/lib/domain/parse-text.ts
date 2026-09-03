import { FOODS, FOOD_BY_ID } from './foods';
import type { Food, Meal, ProposedItem } from './types';

const NUMBER_WORDS: Record<string, number> = {
	a: 1,
	an: 1,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	half: 0.5,
	dozen: 12
};

/**
 * Words that sit between a quantity and the food. Dropped before the catalog is
 * searched — leaving the filler in drags a real match below the threshold.
 */
const UNIT_HINTS = [
	'a',
	'an',
	'of',
	'large',
	'medium',
	'small',
	'slice',
	'slices',
	'cup',
	'cups',
	'tbsp',
	'tsp',
	'scoop',
	'scoops',
	'can',
	'cans',
	'bar',
	'bowl',
	'piece',
	'pieces',
	'oz',
	'g',
	'grams',
	'gram'
];

function tokenize(s: string) {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9%./\s-]/g, ' ')
		.split(/\s+/)
		.filter(Boolean);
}

function scoreFood(query: string, food: Food) {
	const q = query.toLowerCase().trim();
	if (!q) return 0;
	const names = [food.name, food.brand ?? '', ...food.aliases].join(' ').toLowerCase();
	if (food.name.toLowerCase() === q) return 1;
	if (food.aliases.some((a) => a.toLowerCase() === q)) return 0.96;
	if (names.includes(q) && q.length > 2) return 0.86;
	const qt = tokenize(q);
	const nt = new Set(tokenize(names));
	if (!qt.length) return 0;
	const overlap = qt.filter((t) => nt.has(t) || [...nt].some((n) => n.includes(t) && t.length > 3));
	return overlap.length / qt.length;
}

export function findFoods(query: string, limit = 12): { food: Food; score: number }[] {
	const q = query.trim().toLowerCase();
	if (!q) return FOODS.slice(0, limit).map((food) => ({ food, score: 0 }));
	return FOODS.map((food) => ({ food, score: scoreFood(q, food) }))
		.filter((x) => x.score > 0.25)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
}

export function bestFood(query: string) {
	const hits = findFoods(query, 3);
	return hits[0] ?? null;
}

/**
 * Leading-quantity patterns, tried in order. Each yields the quantity and the
 * remaining text: "1/2 avocado", "150g rice", "two eggs".
 */
const QUANTITY_PATTERNS: {
	re: RegExp;
	qty: (m: RegExpMatchArray) => number | undefined;
	restIndex: number;
}[] = [
	{ re: /^(\d+)\s*\/\s*(\d+)\s+(.*)$/, qty: (m) => Number(m[1]) / Number(m[2]), restIndex: 3 },
	{ re: /^(\d+\.?\d*)\s*(x|×)?\s+(.*)$/, qty: (m) => Number(m[1]), restIndex: 3 },
	{ re: /^(\d+\.?\d*)(g|oz|cups?|slices?)?\s+(.*)$/i, qty: (m) => Number(m[1]), restIndex: 3 },
	{ re: /^([a-z]+)\s+(.*)$/i, qty: (m) => NUMBER_WORDS[(m[1] ?? '').toLowerCase()], restIndex: 2 }
];

function parseQuantity(raw: string): { qty: number; rest: string } {
	const s = raw.trim().replace(/^of\s+/, '');
	for (const { re, qty, restIndex } of QUANTITY_PATTERNS) {
		const m = s.match(re);
		if (!m) continue;
		const n = qty(m);
		if (n == null || !Number.isFinite(n)) continue;
		return { qty: n, rest: m[restIndex] ?? '' };
	}
	return { qty: 1, rest: s };
}

function stripUnits(s: string) {
	const tokens = tokenize(s);
	while (tokens.length && UNIT_HINTS.includes(tokens[0] ?? '')) tokens.shift();
	return tokens.join(' ');
}

export function guessMeal(date = new Date()): Meal {
	const h = date.getHours();
	if (h >= 5 && h < 10) return 'breakfast';
	if (h >= 10 && h < 14) return 'lunch';
	if (h >= 14 && h < 17) return 'snack';
	if (h >= 17 && h < 22) return 'dinner';
	return 'snack';
}

export function parseLocalText(
	text: string,
	meal: Meal = guessMeal()
): {
	items: ProposedItem[];
	unmatched: string[];
	allMatched: boolean;
} {
	const chunks = text
		// A slash separates items ("eggs / toast") unless between digits, where it
		// is a fraction ("1/2 avocado") that must survive to parseQuantity.
		.split(/\s*(?:,|;|\+|(?<!\d)\/(?!\d)|\band\b)\s*/i)
		.map((c) => c.trim())
		.filter((c) => c.length > 1);

	const items: ProposedItem[] = [];
	const unmatched: string[] = [];

	for (const chunk of chunks) {
		const { qty, rest } = parseQuantity(chunk);
		const query = stripUnits(rest) || rest;
		const hit = bestFood(query);
		if (hit && hit.score >= 0.55) {
			items.push({
				foodId: hit.food.id,
				query,
				name: hit.food.name,
				servings: qty,
				meal,
				confidence: hit.score
			});
		} else {
			unmatched.push(chunk);
			items.push({
				foodId: null,
				query,
				name: query,
				servings: qty,
				meal,
				confidence: hit?.score ?? 0
			});
		}
	}

	return {
		items,
		unmatched,
		allMatched: unmatched.length === 0 && items.length > 0
	};
}

export function hydrateProposal(p: ProposedItem): ProposedItem {
	if (!p.foodId) return p;
	const food = FOOD_BY_ID[p.foodId];
	if (!food) return p;
	return { ...p, name: food.name };
}
