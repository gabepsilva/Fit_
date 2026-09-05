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
