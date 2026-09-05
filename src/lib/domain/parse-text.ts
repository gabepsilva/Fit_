import { FOODS, FOOD_BY_ID } from './foods';
import { classifyUnit, resolveQuantity, type QuantifiedItem, type QuantitySpec } from './quantity';
import { UNIT_SPELLING_WORDS } from './unit-spellings';
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
 * Every accepted unit spelling comes from `unit-spellings.ts`, the same table
 * `classifyUnit` reads, so a unit word is filler here exactly when it is a
 * unit there.
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
	'scoop',
	'scoops',
	'can',
	'cans',
	'bar',
	'bowl',
	'piece',
	'pieces',
	...UNIT_SPELLING_WORDS
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
 * Units that can be written against the number with no space: "150g rice".
 * `slice` predates the measurement units and stays for "2slices toast"; the
 * rest come from `unit-spellings.ts`, so the glued spelling and the spaced one
 * read the same vocabulary.
 */
const GLUED_UNITS = [...UNIT_SPELLING_WORDS, 'slices', 'slice'];
/** A literal character escaped for use inside a regex alternation — "tbsp." names a dot, not "any character". */
function escapeForRegex(word: string): string {
	return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// Built from a fixed list of identifiers, so no input reaches the pattern.
const GLUED_UNIT_RE = new RegExp(
	`^(\\d+\\.?\\d*)(${GLUED_UNITS.map(escapeForRegex).join('|')})\\s+(.*)$`,
	'i'
);

/**
 * A capture the pattern guarantees. `String` states that without a fallback that
 * could never run — and turns a wrong index into visible text rather than into
 * an empty string indistinguishable from a real one.
 */
function group(m: RegExpMatchArray, index: number): string {
	return String(m[index]);
}

/**
 * Leading-quantity patterns, tried in order. Each yields the quantity and the
 * remaining text: "1/2 avocado", "150g rice", "two eggs". `unitIndex` names the
 * group holding a unit glued to the number, where a pattern reads one.
 */
const QUANTITY_PATTERNS: {
	re: RegExp;
	qty: (m: RegExpMatchArray) => number | undefined;
	restIndex: number;
	unitIndex?: number;
}[] = [
	{ re: /^(\d+)\s*\/\s*(\d+)\s+(.*)$/, qty: (m) => Number(m[1]) / Number(m[2]), restIndex: 3 },
	{ re: /^(\d+\.?\d*)\s*(x|×)?\s+(.*)$/, qty: (m) => Number(m[1]), restIndex: 3 },
	{ re: GLUED_UNIT_RE, qty: (m) => Number(m[1]), restIndex: 3, unitIndex: 2 }
];

/**
 * "two eggs": a quantity written as a word. Matched against the table rather
 * than read out of the phrase, so there is no capture that has to be defended
 * against being absent.
 */
function readNumberWord(s: string): { amount: number; rest: string } | null {
	for (const [word, amount] of Object.entries(NUMBER_WORDS)) {
		const lead = `${word} `;
		if (s.toLowerCase().startsWith(lead)) return { amount, rest: s.slice(lead.length) };
	}
	return null;
}

/**
 * Takes a measurement unit off the front of the text that follows a quantity, so
 * "200 g chicken" and "200g chicken" read alike. A first word that is not a
 * measurement is left where it is: "2 eggs" must keep its food and "2 large
 * eggs" its size, and the last word left in a phrase is never a unit.
 */
function readMeasureUnit(rest: string): { unit: string; rest: string } {
	const space = rest.indexOf(' ');
	if (space === -1) return { unit: '', rest };
	const unit = rest.slice(0, space).toLowerCase();
	if (classifyUnit(unit) === 'serving') return { unit: '', rest };
	return { unit, rest: rest.slice(space + 1) };
}

function parseQuantity(raw: string): { amount: number; unit: string; rest: string } {
	const s = raw.trim().replace(/^of\s+/, '');
	for (const { re, qty, restIndex, unitIndex } of QUANTITY_PATTERNS) {
		const m = s.match(re);
		if (!m) continue;
		const n = qty(m);
		if (n == null || !Number.isFinite(n)) continue;
		const glued = unitIndex === undefined ? '' : group(m, unitIndex).toLowerCase();
		const tail = group(m, restIndex);
		const read = glued ? { unit: glued, rest: tail } : readMeasureUnit(tail);
		return { amount: n, unit: read.unit, rest: read.rest };
	}
	const word = readNumberWord(s);
	if (word) {
		const read = readMeasureUnit(word.rest);
		return { amount: word.amount, unit: read.unit, rest: read.rest };
	}
	// Nothing led the phrase, so there is no unit to read either: a word that
	// happens to be a unit here belongs to the food ("cup of coffee").
	return { amount: 1, unit: '', rest: s };
}

function stripUnits(s: string) {
	const tokens = tokenize(s);
	// A phrase that is nothing but filler has no food to find, so nothing is
	// dropped from it and the caller keeps the text it started with.
	const food = tokens.findIndex((token) => !UNIT_HINTS.includes(token));
	return tokens.slice(Math.max(food, 0)).join(' ');
}

export function guessMeal(date = new Date()): Meal {
	const h = date.getHours();
	if (h >= 5 && h < 10) return 'breakfast';
	if (h >= 10 && h < 14) return 'lunch';
	if (h >= 14 && h < 17) return 'snack';
	if (h >= 17 && h < 22) return 'dinner';
	return 'snack';
}

/** The catalog score a match has to clear before its food is proposed. */
const MATCH_THRESHOLD = 0.55;

/** The catalog food a phrase names, and how sure the search was either way. */
function matchChunk(query: string): { food: Food | null; confidence: number } {
	const hit = bestFood(query);
	if (!hit || hit.score < MATCH_THRESHOLD) return { food: null, confidence: hit?.score ?? 0 };
	return { food: hit.food, confidence: hit.score };
}

function proposeChunk(chunk: string, meal: Meal): { item: QuantifiedItem; matched: boolean } {
	const { amount, unit, rest } = parseQuantity(chunk);
	const query = stripUnits(rest) || rest;
	const { food, confidence } = matchChunk(query);
	const quantity: QuantitySpec = { amount, unit, kind: classifyUnit(unit) };
	// The food carries the serving weight a mass has to be divided by, so the
	// reading only exists once the catalog match does. The spec travels with the
	// proposal so a later match can take the reading again.
	const { servings } = resolveQuantity(quantity, food);
	return {
		matched: food !== null,
		item: {
			foodId: food?.id ?? null,
			query,
			name: food?.name ?? query,
			servings,
			meal,
			confidence,
			quantity
		}
	};
}

export function parseLocalText(
	text: string,
	meal: Meal = guessMeal()
): {
	items: QuantifiedItem[];
	unmatched: string[];
	allMatched: boolean;
} {
	const chunks = text
		// A slash separates items ("eggs / toast") unless between digits, where it
		// is a fraction ("1/2 avocado") that must survive to parseQuantity.
		.split(/\s*(?:,|;|\+|(?<!\d)\/(?!\d)|\band\b)\s*/i)
		.map((c) => c.trim())
		.filter((c) => c.length > 1);

	const items: QuantifiedItem[] = [];
	const unmatched: string[] = [];

	for (const chunk of chunks) {
		const { item, matched } = proposeChunk(chunk, meal);
		if (!matched) unmatched.push(chunk);
		items.push(item);
	}

	return {
		items,
		unmatched,
		allMatched: unmatched.length === 0 && items.length > 0
	};
}

export function hydrateProposal<T extends ProposedItem>(p: T): T {
	if (!p.foodId) return p;
	const food = FOOD_BY_ID[p.foodId];
	if (!food) return p;
	return { ...p, name: food.name };
}
