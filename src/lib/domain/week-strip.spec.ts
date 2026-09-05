import { describe, expect, it } from 'vitest';
import { loggedMarksText } from './week-strip';

describe('loggedMarksText', () => {
	it('reports nothing logged when all three are false', () => {
		expect(loggedMarksText(false, false, false)).toBe('nothing logged');
	});

	it('names food alone', () => {
		expect(loggedMarksText(true, false, false)).toBe('food logged');
	});

	it('names exercise alone', () => {
		expect(loggedMarksText(false, true, false)).toBe('exercise logged');
	});

	it('names weight alone', () => {
		expect(loggedMarksText(false, false, true)).toBe('weight logged');
	});

	it('lists food and weight in order when exercise is missing', () => {
		expect(loggedMarksText(true, false, true)).toBe('food, weight logged');
	});

	it('lists all three in food, exercise, weight order', () => {
		expect(loggedMarksText(true, true, true)).toBe('food, exercise, weight logged');
	});
});
