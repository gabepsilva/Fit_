import { describe, expect, it } from 'vitest';
import { InputValidationError, storedTextProblem } from './input';

describe('storedTextProblem', () => {
	it('accepts ordinary display text at its limit', () => {
		expect(storedTextProblem('x'.repeat(100), 'displayName', 100)).toBeNull();
	});

	it('identifies the field whose value is too long', () => {
		expect(storedTextProblem('x'.repeat(101), 'householdName', 100)).toEqual({
			field: 'householdName',
			code: 'too-long'
		});
	});

	it.each(['line\nbreak', 'tab\tlabel', 'safe\u202Etxt'])('rejects control text: %s', (value) => {
		expect(storedTextProblem(value, 'deviceLabel', 100)).toEqual({
			field: 'deviceLabel',
			code: 'unsafe-characters'
		});
	});
});

describe('InputValidationError', () => {
	it('carries the same structured problem returned at non-throwing boundaries', () => {
		const problem = { field: 'deviceLabel', code: 'too-long' } as const;
		const error = new InputValidationError(problem);
		expect(error).toMatchObject({ name: 'InputValidationError', problem });
		expect(error.message).toBe('deviceLabel is too long');
	});

	it('turns a hyphenated problem code into a readable message', () => {
		const error = new InputValidationError({
			field: 'displayName',
			code: 'unsafe-characters'
		});
		expect(error.message).toBe('displayName is unsafe characters');
	});
});
