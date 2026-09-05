/**
 * The volume a household measure names, and the weight one of them holds for a
 * particular food.
 *
 * Two different things, deliberately kept apart. A millilitre count is a
 * constant: a tablespoon is 15 ml of anything, by the definitions US nutrition
 * labels are written to (21 CFR 101.9(b)(5)(viii)), so it can be shown beside
 * any label without knowing the food. A gram weight is not: a tablespoon of oil
 * is 13.5 g and a tablespoon of flour is 8 g. Weights therefore only ever come
 * from the food's own rows — the catalog's `food_serving` portions, or the
 * food's own default serving label — and never from a density this module
 * invents.
 */

import { canonicalUnit, isVolumeUnit } from './unit-spellings';

/** The volume units the app converts. */
export type VolumeUnit = 'tsp' | 'tbsp' | 'cup' | 'ml' | 'l';

/** Millilitres in one of each, by the US nutrition-labelling definitions. */
export const UNIT_ML: Record<VolumeUnit, number> = {
	tsp: 5,
	tbsp: 15,
	cup: 240,
	ml: 1,
	l: 1000
};

/** What one of a unit weighs for one food. */
export type Portion = { unit: VolumeUnit; grams: number };

/** Whatever a caller holds that could name a volume: a `Food`, or a bare row. */
type PortionSource = {
	grams: number;
	servingLabel?: string | undefined;
	portions?: readonly Portion[] | undefined;
};

/**
 * The densities food is found in, in grams per millilitre.
 *
 * A bound, not a conversion: nothing here guesses a density, and a portion that
 * falls inside is used exactly as the catalog gave it. The catalog holds rows
 * that cannot be true — 310 of them say `1 tsp (100 g)`, which is twenty times
 * the density of water — and reading one would log twenty times the food.
 * Honey, at 1.4, is the densest thing eaten by the spoonful, and puffed cereal
 * near 0.1 the lightest; the bounds sit well outside both so that real data is
 * never refused and arithmetic that cannot be right always is.
 */
const MIN_DENSITY = 0.05;
const MAX_DENSITY = 3;

/**
 * A serving label states a volume outright, or it does not count.
 *
 * A count, one word, and at most a parenthetical: `1 cup`, `2 Tbsp`,
 * `1 Tbsp (15 ml)`, `1 1/2 cup`. Anything else in the label means the label is
 * describing something the count does not measure — `170 g cup`, `1/2 cup dry`,
 * `1 PUDDING CUP` — and reading a number out of those is the guessing #72
 * removed and #94 declined to bring back.
 */
const STATED_VOLUME = /^([0-9][0-9./ ]*?) ([a-z]+)(?:\s*\([^()]*\))?$/i;

/** A weight a division can be trusted to: finite and above zero. */
function isWeight(grams: number): boolean {
	return Number.isFinite(grams) && grams > 0;
}

/**
 * The unit a word names, or `null` when it names no volume.
 *
 * Reads `unit-spellings.ts`, the table `quantity.ts`'s `classifyUnit` also
 * reads, so a spelling accepted here on a catalog label is accepted there on
 * a typed quantity, and vice versa (issue #111).
 */
export function volumeUnit(word: string): VolumeUnit | null {
	const unit = canonicalUnit(word);
	return isVolumeUnit(unit) ? unit : null;
}

/**
 * "1", "0.5", "1/2" or "1 1/2" as a number. A whole part and a fraction add up,
 * and a run of spaces contributes the `Number('')` of nothing; anything the
 * pattern let through that is not a number comes back as `NaN`, which every
 * caller already refuses.
 */
function readCount(text: string): number {
	return text.split(' ').reduce((total, part) => total + fractionOf(part), 0);
}

function fractionOf(part: string): number {
	const [top, bottom] = part.split('/');
	return bottom === undefined ? Number(top) : Number(top) / Number(bottom);
}

/** The count and unit a label states, or `null` when it states none. */
function readLabel(label: string): { count: number; unit: VolumeUnit } | null {
	const match = STATED_VOLUME.exec(label.trim());
	if (match === null) return null;
	// The captures the pattern guarantees, stated without a fallback that cannot run.
	const unit = volumeUnit(String(match[2]));
	if (unit === null) return null;
	return { count: readCount(String(match[1])), unit };
}

/**
 * What one unit weighs, read off a catalog label and the weight beside it.
 *
 * `'2 Tbsp'` weighing 32 g is 16 g in one tablespoon: the catalog's labels carry
 * their own counts, so the weight has to be divided back down to a single unit
 * before anything can be scaled by it.
 */
export function parsePortionLabel(label: string, grams: number): Portion | null {
	const read = readLabel(label);
	if (read === null || !isWeight(grams)) return null;
	// A count of zero, or one the pattern let through as `NaN`, makes this
	// infinite or `NaN`, and no comparison against a bound accepts either.
	const perUnit = grams / read.count;
	const density = perUnit / UNIT_ML[read.unit];
	if (density < MIN_DENSITY || density > MAX_DENSITY) return null;
	return { unit: read.unit, grams: perUnit };
}

/**
 * What one of the unit a person typed weighs for this food, or `null` when the
 * food does not say.
 *
 * The food's own portion rows first, then its default serving label, and
 * nothing after that: a unit neither of them names is refused rather than
 * converted through an assumed density.
 */
export function gramsPerVolumeUnit(
	typed: string,
	food: PortionSource | null | undefined
): number | null {
	if (!food) return null;
	// `null` when the word names no volume, which no portion row and no parsed
	// label can equal, so it falls through to the same refusal without a guard.
	const unit = volumeUnit(typed);
	const listed = food.portions?.find((row) => row.unit === unit && isWeight(row.grams));
	if (listed !== undefined) return listed.grams;
	const { servingLabel } = food;
	if (servingLabel === undefined) return null;
	const parsed = parsePortionLabel(servingLabel, food.grams);
	return parsed !== null && parsed.unit === unit ? parsed.grams : null;
}

/**
 * Units worth a millilitre hint. A label already counting millilitres or litres
 * would only be told its own number back.
 */
const HINTED: readonly VolumeUnit[] = ['tsp', 'tbsp', 'cup'];

/**
 * A serving label with the volume it comes to: `1 tbsp` reads `1 tbsp (15 ml)`.
 *
 * The millilitres are the unit's definition, not the food's — so this is safe to
 * show on any food, including one whose weight the catalog never gave. A label
 * that already carries a parenthetical keeps the one it has rather than gaining
 * a second.
 */
export function withVolumeHint(label: string): string {
	const read = readLabel(label);
	if (read === null || !HINTED.includes(read.unit)) return label;
	if (!isWeight(read.count) || label.includes('(')) return label;
	// One decimal, the same as `round1`: a quarter teaspoon is 1.3 ml, and
	// rounding it to a whole millilitre would lose a quarter of it.
	return `${label} (${Math.round(read.count * UNIT_ML[read.unit] * 10) / 10} ml)`;
}
