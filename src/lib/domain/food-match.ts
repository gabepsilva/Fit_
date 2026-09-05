import { FOODS } from './foods';
import { tokenize } from './text-tokens';
import type { Food } from './types';

/**
 * Fuzzy search over the bundled foods.
 *
 * This is what answers with no connection. Naming the food a typed sentence
 * held is the server's job now (`POST /api/foods/resolve` against 2.5 million
 * rows), so what is left here is the offline half: the search box and the
 * catalog page, ranking the sample foods this build ships.
 */

/**
 * How well one food answers a query, from 0 to 1. `q` arrives already trimmed
 * and lower-cased from `findFoods`, which is the only caller: an exact name
 * beats an exact alias, which beats the query appearing anywhere in the food's
 * text, which beats the share of the query's words the food accounts for.
 */
function scoreFood(q: string, food: Food) {
	// One space between every part the food is findable by, and no gap where a
	// food carries no brand: the text is searched as text, so a doubled space
	// would keep a query that spans the name and an alias from matching.
	const parts = [food.name, food.brand, ...food.aliases].filter((part) => part !== undefined);
	const names = parts.join(' ').toLowerCase();
	if (food.name.toLowerCase() === q) return 1;
	if (food.aliases.some((a) => a.toLowerCase() === q)) return 0.96;
	if (names.includes(q) && q.length > 2) return 0.86;
	const qt = tokenize(q);
	const nt = new Set(tokenize(names));
	const overlap = qt.filter((t) => nt.has(t) || [...nt].some((n) => n.includes(t) && t.length > 3));
	// A query with no words at all divides zero by zero, and the threshold in
	// `findFoods` turns the result away as it turns away every weak score. A
	// guard here would be a branch nothing could observe.
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
