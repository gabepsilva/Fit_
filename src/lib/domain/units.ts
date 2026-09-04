import type { UnitSystem } from './types';
import { round1 } from './utils';

/**
 * Converts a canonical stored value (kilograms, centimeters) into the unit
 * system a person reads in, and back again for what they type. Storage is
 * never touched by this module — a `WeightEntry.kg` or `Profile.heightCm`
 * stays exactly as recorded no matter which system is on display. This is
 * the only place in the app a mass or a length is converted or rounded.
 */

const KG_PER_LB = 0.45359237; // exact, by international agreement
const CM_PER_IN = 2.54; // exact

export function kgToLb(kg: number): number {
	return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
	return lb * KG_PER_LB;
}

export function cmToIn(cm: number): number {
	return cm / CM_PER_IN;
}

export function inToCm(inches: number): number {
	return inches * CM_PER_IN;
}

/** The word a screen reader should announce — never the abbreviation alone. */
export function weightUnitName(units: UnitSystem): string {
	return units === 'imperial' ? 'pounds' : 'kilograms';
}

export function weightUnitAbbr(units: UnitSystem): string {
	return units === 'imperial' ? 'lb' : 'kg';
}

export function heightUnitName(units: UnitSystem): string {
	return units === 'imperial' ? 'feet and inches' : 'centimeters';
}

/**
 * A stored `kg` (body weight, or a `kg`/week trend delta — the conversion is
 * a pure scale, so a delta converts the same way a quantity does), read in
 * the chosen system and rounded to the one decimal a body weight is read at.
 */
export function displayWeight(kg: number, units: UnitSystem): number {
	return round1(units === 'imperial' ? kgToLb(kg) : kg);
}

/** The canonical `kg` for a number a person typed in the chosen system. */
export function weightToKg(value: number, units: UnitSystem): number {
	return units === 'imperial' ? lbToKg(value) : value;
}

export type DisplayHeight = { feet: number; inches: number } | { cm: number };

/** A stored `heightCm`, read in the chosen system: whole cm, or feet + inches. */
export function displayHeight(cm: number, units: UnitSystem): DisplayHeight {
	if (units === 'metric') return { cm: Math.round(cm) };
	const totalInches = Math.round(cmToIn(cm));
	return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

/** `displayHeight` rendered as text: "168 cm" or "5′6″". */
export function formatHeight(cm: number, units: UnitSystem): string {
	const h = displayHeight(cm, units);
	return 'cm' in h ? `${h.cm} cm` : `${h.feet}′${h.inches}″`;
}

/** The canonical `heightCm` for feet and inches a person typed in imperial. */
export function heightFromFeetInches(feet: number, inches: number): number {
	return inToCm(feet * 12 + inches);
}
