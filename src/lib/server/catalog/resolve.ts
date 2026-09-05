import type { DatabaseSync } from 'node:sqlite';
import { searchFoods, type CatalogFood } from './foods';

/**
 * One food name, resolved against the catalog.
 *
 * Two callers ask the same question of the catalog and must get the same
 * answer: `POST /api/meals/photo` resolving what the vision model saw, and
 * `POST /api/foods/resolve` resolving what somebody typed. Neither of them
 * decides how a name becomes a food -- this does, once.
 */

/** The first hit, plus the two `alternatives` behind it. Three is what one search fetches. */
const CANDIDATES = 3;

/**
 * What the catalog had for one name. `food` is the row it ranked first and
 * `alternatives` the two behind it, so a wrong first guess is one tap from
 * being right. `null` is the catalog saying it has nothing, which is a fact the
 * caller shows rather than an error.
 */
export type ResolvedFood = {
	food: CatalogFood | null;
	alternatives: CatalogFood[];
};

/** The catalog's answer for one name. */
export function resolveFood(catalog: DatabaseSync, query: string): ResolvedFood {
	const found = searchFoods(catalog, query, CANDIDATES);
	return { food: found[0] ?? null, alternatives: found.slice(1, CANDIDATES) };
}
