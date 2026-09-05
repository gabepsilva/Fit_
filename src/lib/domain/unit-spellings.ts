/**
 * The one table every spelling of a measurement unit is read from.
 *
 * Before this module existed, `portions.ts` accepted "tablespoons" on a
 * catalog serving label while `quantity.ts` did not accept it on a typed
 * quantity — issue #111. Both sides, plus the food-query stripper in
 * `parse-text.ts`, now read the same map, so a spelling accepted in one place
 * is accepted everywhere and there is exactly one list to extend.
 */

/** The unit a spelling maps to. */
export type CanonicalUnit = 'tsp' | 'tbsp' | 'cup' | 'ml' | 'l' | 'g' | 'kg' | 'oz' | 'lb';

/** The canonical units that name a volume. `portions.ts` names this `VolumeUnit`. */
export type VolumeCanonicalUnit = 'tsp' | 'tbsp' | 'cup' | 'ml' | 'l';

/** Every spelling this app accepts, mapped to its canonical unit, case rules aside. */
export const UNIT_SPELLINGS: Readonly<Record<string, CanonicalUnit>> = {
	tsp: 'tsp',
	tsps: 'tsp',
	teaspoon: 'tsp',
	teaspoons: 'tsp',
	tbsp: 'tbsp',
	'tbsp.': 'tbsp',
	tbsps: 'tbsp',
	tbs: 'tbsp',
	tablespoon: 'tbsp',
	tablespoons: 'tbsp',
	cup: 'cup',
	cups: 'cup',
	ml: 'ml',
	milliliter: 'ml',
	milliliters: 'ml',
	millilitre: 'ml',
	millilitres: 'ml',
	l: 'l',
	liter: 'l',
	liters: 'l',
	litre: 'l',
	litres: 'l',
	g: 'g',
	gram: 'g',
	grams: 'g',
	kg: 'kg',
	oz: 'oz',
	ounce: 'oz',
	ounces: 'oz',
	lb: 'lb',
	lbs: 'lb',
	pound: 'lb',
	pounds: 'lb'
} as const;

/**
 * The units `UNIT_SPELLINGS` can map to that name a volume. Typed to admit
 * `null` too, though nothing ever inserts it: `Set.has(null)` answers `false`
 * like it would for any other value the set does not hold, so `isVolumeUnit`
 * can take the `null` `canonicalUnit` reads back for an unrecognized word
 * without a runtime branch of its own to tell the two apart.
 */
const VOLUME_UNITS: ReadonlySet<CanonicalUnit | null> = new Set<CanonicalUnit | null>([
	'tsp',
	'tbsp',
	'cup',
	'ml',
	'l'
]);

/**
 * The unit a typed or labelled word names, or `null` when it names none this
 * app knows.
 *
 * `Object.hasOwn`, not a lookup: "constructor" and "toString" answer on every
 * plain object, and a wrong unit here silently converts by the wrong rule.
 */
export function canonicalUnit(word: string): CanonicalUnit | null {
	const spelled = word.trim().toLowerCase();
	// `hasOwn` already proved the key present; the cast only tells the compiler
	// what `hasOwn` cannot — an index signature reads as possibly-`undefined`
	// (`noUncheckedIndexedAccess`) whether or not the key is known to exist.
	return Object.hasOwn(UNIT_SPELLINGS, spelled) ? (UNIT_SPELLINGS[spelled] as CanonicalUnit) : null;
}

/**
 * Whether a canonical unit measures a volume rather than a mass. Takes `null`
 * too — the unit `canonicalUnit` reads back for a word it does not
 * recognize — and answers `false` for it exactly as it would for a mass unit,
 * so a caller never has to guard the two apart first.
 */
export function isVolumeUnit(unit: CanonicalUnit | null): unit is VolumeCanonicalUnit {
	return VOLUME_UNITS.has(unit);
}

/** Every accepted spelling, for callers that scan text for one rather than looking one up. */
export const UNIT_SPELLING_WORDS: readonly string[] = Object.keys(UNIT_SPELLINGS);
