import type { AdherenceWeek } from '$lib/domain/training-progress';
import { displayWeight, formatWeight, weightUnitAbbr } from '$lib/domain/units';
import type { UnitSystem } from '$lib/domain/types';

/**
 * How the current week's training reads on Today: sessions done against
 * whatever the plan asked for, stated once and left alone. A week the plan
 * left empty asks for nothing, so it is reported as sessions done, not a
 * shortfall against zero.
 */
export function trainingWeekText(week: Pick<AdherenceWeek, 'planned' | 'done'>): string {
	if (week.planned === 0 && week.done === 0) return 'No training logged or planned this week.';
	if (week.planned === 0) {
		return `${week.done} session${week.done === 1 ? '' : 's'} this week. Nothing was planned.`;
	}
	return `${week.done} of ${week.planned} session${week.planned === 1 ? '' : 's'} this week.`;
}

/**
 * Where weight stands: the latest reading and its direction of travel, in
 * the unit the person chose. Reported, not editorialized — a person moving
 * against their own goal already knows.
 */
export function weightStatusText(args: {
	/** Whether any weight has ever been recorded — false is every new account. */
	hasWeight: boolean;
	/** Whether enough readings exist for `kgPerWeek` to mean anything. */
	hasTrend: boolean;
	kg: number;
	kgPerWeek: number;
	units: UnitSystem;
}): string {
	const { hasWeight, hasTrend, kg, kgPerWeek, units } = args;
	if (!hasWeight) return 'No weight recorded yet.';
	const abbr = weightUnitAbbr(units);
	const reading = `${formatWeight(kg, units)} ${abbr}`;
	if (!hasTrend) return `${reading}. Not enough entries yet for a trend.`;
	const rate = displayWeight(Math.abs(kgPerWeek), units);
	if (rate === 0) return `${reading}, holding steady.`;
	const direction = Math.sign(kgPerWeek) === -1 ? 'down' : 'up';
	return `${reading}, trending ${direction} ${rate.toFixed(1)} ${abbr}/week.`;
}
