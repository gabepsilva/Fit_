import type { LogItem, Meal, Micros, Profile, TendState } from './types';
import { todayISO } from './utils';

export function exportJson(state: TendState) {
	return JSON.stringify(
		{
			exportedAt: new Date().toISOString(),
			format: 'tend.v1',
			...state
		},
		null,
		2
	);
}

export function exportCsv(profile: Profile) {
	const header = [
		'date',
		'meal',
		'name',
		'brand',
		'servings',
		'serving_label',
		'kcal',
		'protein_g',
		'carbs_g',
		'fat_g',
		'fiber_g',
		'sodium_mg',
		'potassium_mg',
		'iron_mg',
		'b12_mcg',
		'provenance',
		'source'
	];
	const rows = [...profile.log]
		.sort((a, b) => a.date.localeCompare(b.date) || a.meal.localeCompare(b.meal))
		.map((i) =>
			[
				i.date,
				i.meal,
				csv(i.name),
				csv(i.brand ?? ''),
				i.servings,
				csv(i.servingLabel),
				i.kcal,
				i.protein,
				i.carbs,
				i.fat,
				i.micros.fiber,
				i.micros.sodium,
				i.micros.potassium,
				i.micros.iron,
				i.micros.vitaminB12,
				i.provenance ?? '',
				i.source
			].join(',')
		);
	return [header.join(','), ...rows].join('\n');
}

function csv(s: string) {
	if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
	return s;
}

/** Best-effort MyFitnessPal daily summary / diary CSV. */
export function parseMfpCsv(text: string) {
	const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
	if (lines.length < 2) return [];
	const header = splitCsv(lines[0] ?? '').map((h) => h.trim().toLowerCase());
	const idx = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
	const dateI = idx(['date']);
	const nameI = idx(['name', 'food', 'item']);
	const kcalI = idx(['calories', 'kcal', 'energy']);
	const pI = idx(['protein']);
	const cI = idx(['carb']);
	const fI = idx(['fat']);
	const mealI = idx(['meal', 'folder']);
	if (nameI < 0) return [];

	const out: {
		date: string;
		name: string;
		meal: string;
		kcal: number;
		protein: number;
		carbs: number;
		fat: number;
	}[] = [];

	for (const line of lines.slice(1)) {
		const cols = splitCsv(line);
		const name = cols[nameI]?.trim();
		// Summary rows ("Totals", "Goal", "Remaining") are not food.
		if (!name || /^(total|goal|remaining|foods)/i.test(name)) continue;
		out.push({
			date: rowDate(dateI >= 0 ? cols[dateI] : undefined),
			name,
			meal: (cols[mealI] ?? 'snack').toLowerCase(),
			kcal: num(cols[kcalI]),
			protein: num(cols[pI]),
			carbs: num(cols[cI]),
			fat: num(cols[fI])
		});
	}
	return out;
}

/** Anything that is not a plain ISO date falls back to today. */
function rowDate(raw: string | undefined) {
	const date = (raw ?? '').slice(0, 10);
	return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO();
}

function num(s: string | undefined) {
	const n = Number(String(s ?? '').replace(/[^0-9.-]/g, ''));
	return Number.isFinite(n) ? n : 0;
}

function splitCsv(line: string) {
	const out: string[] = [];
	let cur = '';
	let q = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			if (q && line[i + 1] === '"') {
				cur += '"';
				i++;
			} else q = !q;
		} else if (ch === ',' && !q) {
			out.push(cur);
			cur = '';
		} else cur += ch;
	}
	out.push(cur);
	return out;
}

const NO_MICROS: Micros = {
	fiber: 0,
	sugar: 0,
	sodium: 0,
	potassium: 0,
	iron: 0,
	calcium: 0,
	magnesium: 0,
	zinc: 0,
	vitaminA: 0,
	vitaminC: 0,
	vitaminD: 0,
	vitaminB12: 0,
	folate: 0
};

const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** How many imported rows are accepted in one paste. */
export const MFP_IMPORT_LIMIT = 80;

/**
 * Turn parsed MyFitnessPal rows into log entries. They carry no `foodId`, so
 * they land as custom lines with zeroed micronutrients — an imported row states
 * calories and macros, and inventing micros from nothing would be worse than
 * showing none.
 */
export function mfpRowsToLogItems(
	rows: ReturnType<typeof parseMfpCsv>,
	makeId: () => string
): LogItem[] {
	return rows.slice(0, MFP_IMPORT_LIMIT).map((r) => ({
		id: makeId(),
		foodId: null,
		date: r.date,
		meal: (MEALS as string[]).includes(r.meal) ? (r.meal as Meal) : 'snack',
		servings: 1,
		source: 'manual',
		name: r.name,
		kcal: r.kcal,
		protein: r.protein,
		carbs: r.carbs,
		fat: r.fat,
		micros: { ...NO_MICROS },
		servingLabel: 'imported'
	}));
}
