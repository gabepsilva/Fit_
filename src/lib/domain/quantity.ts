import type { Food, ProposedItem } from './types';

/**
 * What the app can do with the unit a person typed in front of a food.
 *
 * `serving` covers a bare number and the per-item words ("2 slices", "1 scoop"):
 * one of those is one catalog serving, so the number carries straight through.
 * `mass` resolves against the food's own serving weight, which every `Food`
 * carries as `grams`. `volume` cannot be resolved at all — the catalog stores
 * mass and no density, and a cup of milk and a cup of flour are different
 * masses — so a volume is reported back to the person rather than guessed at.
 */
export type QuantityKind = 'serving' | 'mass' | 'volume';

const OUNCE = 28.349523125;
const POUND = 453.59237;

/**
 * Grams in one of each unit the parser accepts, with `0` for the units of volume
 * it cannot convert: the catalog stores mass and no density, so those are listed
 * to be refused knowingly rather than guessed at. Mass conversions are exact by
 * definition of the international pound.
 */
const UNIT_GRAMS: Record<string, number> = {
	g: 1,
	gram: 1,
	grams: 1,
	kg: 1000,
	oz: OUNCE,
	ounce: OUNCE,
	ounces: OUNCE,
	lb: POUND,
	lbs: POUND,
	pound: POUND,
	pounds: POUND,
	cup: 0,
	cups: 0,
	tbsp: 0,
	tsp: 0,
	ml: 0,
	l: 0
};

/**
 * Every unit worth reading off the front of a phrase. Order does not matter: an
 * alternation built from it is anchored to what follows, so "150grams" cannot
 * settle for the "g" it tries first.
 */
export const MEASURE_UNITS: readonly string[] = Object.keys(UNIT_GRAMS);

export type QuantitySpec = {
	/** The number the person typed. */
	amount: number;
	/** The unit as typed, lowercased. Empty when they gave a bare number. */
	unit: string;
	kind: QuantityKind;
};

export type ResolvedQuantity = {
	/** Servings to record. */
	servings: number;
	/** The quantity the app would not act on, or `null` when it took it as typed. */
	declined: QuantitySpec | null;
};

/** Only `grams` is read, so a caller need not hold a whole catalog row. */
type ServingWeight = Pick<Food, 'grams'>;

export function classifyUnit(unit: string): QuantityKind {
	// `Object.hasOwn`, not a lookup: "constructor" and "toString" are on every object.
	const u = unit.toLowerCase();
	if (!Object.hasOwn(UNIT_GRAMS, u)) return 'serving';
	return UNIT_GRAMS[u] === 0 ? 'volume' : 'mass';
}

/**
 * Two decimals is the precision the serving stepper itself works in, so a parsed
 * count and a tapped one stay the same kind of number. A quantity too small to
 * survive that rounding keeps its value: recording zero would log nothing at all.
 */
function roundServings(n: number): number {
	const rounded = Math.round(n * 100) / 100;
	return rounded > 0 ? rounded : n;
}

export function resolveQuantity(
	spec: QuantitySpec,
	food: ServingWeight | null | undefined
): ResolvedQuantity {
	// Anything the app will not act on records one serving — the smallest thing it
	// can defend — and comes back named, so the person sees it before committing.
	const declined: ResolvedQuantity = { servings: 1, declined: spec };
	if (!Number.isFinite(spec.amount)) return declined;
	if (spec.kind === 'serving') return { servings: spec.amount, declined: null };
	if (spec.kind === 'volume') return declined;
	// Guards the division: an absent, zero, negative or non-finite serving weight
	// would otherwise yield Infinity or NaN servings and log a meaningless entry.
	const perServing = food?.grams ?? 0;
	if (!Number.isFinite(perServing) || perServing <= 0) return declined;
	const grams = spec.amount * (UNIT_GRAMS[spec.unit.toLowerCase()] ?? 1);
	return { servings: roundServings(grams / perServing), declined: null };
}

/** Trims a count to something readable without pretending to precision it lacks. */
function formatCount(n: number): string {
	return String(Math.round(n * 1000) / 1000);
}

/**
 * One line saying what will be logged, in servings and in grams, so the reading
 * is visible before the entry is committed. A declined unit is named rather than
 * converted, and nothing is promised about it.
 */
export function describeRecorded(
	servings: number,
	food: ServingWeight | null | undefined,
	declined: QuantitySpec | null
): string {
	const perServing = food?.grams ?? 0;
	const mass =
		Number.isFinite(perServing) && perServing > 0
			? ` · ${Math.round(servings * perServing)} g`
			: '';
	const recorded = `${formatCount(servings)} ${servings === 1 ? 'serving' : 'servings'}${mass}`;
	if (!declined) return recorded;
	return `Couldn’t use “${formatCount(declined.amount)} ${declined.unit}” — recorded as ${recorded}`;
}

/** A proposal that remembers the quantity it was parsed from. */
export type QuantifiedItem = ProposedItem & { quantity?: QuantitySpec | undefined };

/**
 * Points a proposal at a catalog food, re-reading the typed quantity against it.
 * A mass typed against text the parser could not match has no serving weight to
 * divide by until this moment, so the reading has to be taken again here.
 */
export function matchToFood(item: QuantifiedItem, food: Food): QuantifiedItem {
	const servings = item.quantity ? resolveQuantity(item.quantity, food).servings : item.servings;
	return { ...item, foodId: food.id, name: food.name, confidence: 1, servings };
}
