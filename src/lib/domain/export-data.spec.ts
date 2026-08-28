import { describe, expect, it } from 'vitest';
import { buildAlexProfile, emptyProfile } from './demo-seed';
import {
	exportCsv,
	exportJson,
	MFP_IMPORT_LIMIT,
	mfpRowsToLogItems,
	parseMfpCsv
} from './export-data';
import type { TendState } from './types';
import { todayISO } from './utils';

const state: TendState = {
	onboarded: true,
	activeProfileId: 'p1',
	profiles: [{ ...emptyProfile({ name: 'Alex' }), id: 'p1' }],
	weekPlan: [],
	pantry: []
};

describe('exportJson', () => {
	it('produces parseable JSON', () => {
		expect(() => JSON.parse(exportJson(state)) as unknown).not.toThrow();
	});

	it('stamps the format and export time', () => {
		const parsed = JSON.parse(exportJson(state)) as { format: string; exportedAt: string };
		expect(parsed.format).toBe('tend.v1');
		expect(parsed.exportedAt).toBeTruthy();
	});

	it('carries the profiles through', () => {
		const parsed = JSON.parse(exportJson(state)) as TendState;
		expect(parsed.profiles).toHaveLength(1);
	});
});

describe('exportCsv', () => {
	it('emits a header plus one row per log entry', () => {
		const profile = buildAlexProfile();
		const lines = exportCsv(profile).split('\n');
		expect(lines.length).toBe(profile.log.length + 1);
	});

	it('emits only a header for an empty log', () => {
		expect(exportCsv(emptyProfile({ name: 'Empty' })).split('\n')).toHaveLength(1);
	});

	it('quotes a field containing a comma so the row does not split', () => {
		const profile = emptyProfile({ name: 'Q' });
		profile.log = [
			{
				id: 'x',
				foodId: null,
				date: '2026-06-01',
				meal: 'lunch',
				servings: 1,
				source: 'manual',
				name: 'rice, beans',
				kcal: 100,
				protein: 5,
				carbs: 20,
				fat: 1,
				micros: emptyProfile({ name: 'M' }).log[0]?.micros ?? {
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
				},
				servingLabel: 'bowl'
			}
		];
		expect(exportCsv(profile)).toContain('"rice, beans"');
	});
});

describe('parseMfpCsv', () => {
	const csv = [
		'Date,Meal,Name,Calories,Protein,Carbohydrates,Fat',
		'2026-06-01,Breakfast,Oatmeal,300,10,50,5',
		'2026-06-01,Lunch,Chicken salad,450,40,10,25'
	].join('\n');

	it('reads every food row', () => {
		expect(parseMfpCsv(csv)).toHaveLength(2);
	});

	it('reads the macros', () => {
		expect(parseMfpCsv(csv)[0]).toMatchObject({ kcal: 300, protein: 10, carbs: 50, fat: 5 });
	});

	it('keeps the row date', () => {
		expect(parseMfpCsv(csv)[0]?.date).toBe('2026-06-01');
	});

	it('lowercases the meal', () => {
		expect(parseMfpCsv(csv)[0]?.meal).toBe('breakfast');
	});

	it('skips summary rows', () => {
		const withTotals = `${csv}\n2026-06-01,Lunch,Totals,750,50,60,30`;
		expect(parseMfpCsv(withTotals)).toHaveLength(2);
	});

	it('returns nothing for empty input', () => {
		expect(parseMfpCsv('')).toEqual([]);
	});

	it('returns nothing when there is no name column to key on', () => {
		expect(parseMfpCsv('Date,Calories\n2026-06-01,300')).toEqual([]);
	});

	it('falls back to today when the date is unusable', () => {
		const bad = 'Date,Name,Calories\nnot-a-date,Oatmeal,300';
		expect(parseMfpCsv(bad)[0]?.date).toBe(todayISO());
	});

	it('reads a quoted field containing a comma as one value', () => {
		const quoted = 'Date,Name,Calories\n2026-06-01,"Rice, beans",300';
		expect(parseMfpCsv(quoted)[0]?.name).toBe('Rice, beans');
	});

	it('reads an escaped quote inside a quoted field', () => {
		const quoted = 'Date,Name,Calories\n2026-06-01,"Dave\'\'s ""Killer"" Bread",300';
		expect(parseMfpCsv(quoted)[0]?.name).toContain('Killer');
	});

	it('treats a non-numeric macro as zero', () => {
		const odd = 'Date,Name,Calories\n2026-06-01,Oatmeal,none';
		expect(parseMfpCsv(odd)[0]?.kcal).toBe(0);
	});

	it('falls back to today when there is no date column at all', () => {
		const noDate = 'Name,Calories\nOatmeal,300';
		expect(parseMfpCsv(noDate)[0]?.date).toBe(todayISO());
	});

	it('strips units from numeric fields', () => {
		const withUnits = 'Date,Name,Calories\n2026-06-01,Oatmeal,300 kcal';
		expect(parseMfpCsv(withUnits)[0]?.kcal).toBe(300);
	});
});

describe('mfpRowsToLogItems', () => {
	const rows = parseMfpCsv(
		['Date,Meal,Name,Calories,Protein', '2026-06-01,Breakfast,Oatmeal,300,10'].join('\n')
	);

	it('maps one item per row', () => {
		expect(mfpRowsToLogItems(rows, () => 'id')).toHaveLength(1);
	});

	it('leaves imported items unmatched to the catalog', () => {
		expect(mfpRowsToLogItems(rows, () => 'id')[0]?.foodId).toBeNull();
	});

	it('zeroes micronutrients rather than inventing them', () => {
		expect(mfpRowsToLogItems(rows, () => 'id')[0]?.micros.fiber).toBe(0);
	});

	it('falls back to snack for an meal it does not know', () => {
		const odd = parseMfpCsv('Date,Meal,Name,Calories\n2026-06-01,Elevenses,Scone,200');
		expect(mfpRowsToLogItems(odd, () => 'id')[0]?.meal).toBe('snack');
	});

	it('caps a very large paste', () => {
		const many = Array.from({ length: MFP_IMPORT_LIMIT + 20 }, (_, i) => ({
			date: '2026-06-01',
			name: `Item ${i}`,
			meal: 'lunch',
			kcal: 100,
			protein: 1,
			carbs: 1,
			fat: 1
		}));
		expect(mfpRowsToLogItems(many, () => 'id')).toHaveLength(MFP_IMPORT_LIMIT);
	});
});
