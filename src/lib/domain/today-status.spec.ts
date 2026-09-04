import { describe, expect, it } from 'vitest';
import { trainingWeekText, weightStatusText } from './today-status';

describe('trainingWeekText', () => {
	it('states plainly when nothing was logged or planned', () => {
		expect(trainingWeekText({ planned: 0, done: 0 })).toBe(
			'No training logged or planned this week.'
		);
	});

	it('reports sessions done when the plan asked for nothing', () => {
		expect(trainingWeekText({ planned: 0, done: 2 })).toBe(
			'2 sessions this week. Nothing was planned.'
		);
	});

	it('singularizes one session against an empty plan', () => {
		expect(trainingWeekText({ planned: 0, done: 1 })).toBe(
			'1 session this week. Nothing was planned.'
		);
	});

	it('reports done against planned without judgement when short', () => {
		expect(trainingWeekText({ planned: 3, done: 1 })).toBe('1 of 3 sessions this week.');
	});

	it('reports done against planned when met', () => {
		expect(trainingWeekText({ planned: 3, done: 3 })).toBe('3 of 3 sessions this week.');
	});

	it('singularizes a plan of one', () => {
		expect(trainingWeekText({ planned: 1, done: 0 })).toBe('0 of 1 session this week.');
	});
});

describe('weightStatusText', () => {
	it('says plainly when nothing has been recorded', () => {
		expect(
			weightStatusText({ hasWeight: false, hasTrend: false, kg: 70, kgPerWeek: 0, units: 'metric' })
		).toBe('No weight recorded yet.');
	});

	it('reads the single entry without a trend claim', () => {
		expect(
			weightStatusText({ hasWeight: true, hasTrend: false, kg: 80, kgPerWeek: 0, units: 'metric' })
		).toBe('80.0 kg. Not enough entries yet for a trend.');
	});

	it('converts to imperial for the reading', () => {
		const text = weightStatusText({
			hasWeight: true,
			hasTrend: false,
			kg: 80,
			kgPerWeek: 0,
			units: 'imperial'
		});
		expect(text).toBe('176.4 lb. Not enough entries yet for a trend.');
	});

	it('reports a downward trend without editorializing', () => {
		expect(
			weightStatusText({
				hasWeight: true,
				hasTrend: true,
				kg: 79,
				kgPerWeek: -0.3,
				units: 'metric'
			})
		).toBe('79.0 kg, trending down 0.3 kg/week.');
	});

	it('reports an upward trend the same way', () => {
		expect(
			weightStatusText({
				hasWeight: true,
				hasTrend: true,
				kg: 82,
				kgPerWeek: 0.3,
				units: 'metric'
			})
		).toBe('82.0 kg, trending up 0.3 kg/week.');
	});

	it('reports steady when the trend rounds to nothing in the shown unit', () => {
		expect(
			weightStatusText({
				hasWeight: true,
				hasTrend: true,
				kg: 79,
				kgPerWeek: 0.001,
				units: 'metric'
			})
		).toBe('79.0 kg, holding steady.');
	});

	it('converts the trend rate to imperial too', () => {
		const text = weightStatusText({
			hasWeight: true,
			hasTrend: true,
			kg: 79,
			kgPerWeek: -0.45359237,
			units: 'imperial'
		});
		expect(text).toBe('174.2 lb, trending down 1.0 lb/week.');
	});
});
