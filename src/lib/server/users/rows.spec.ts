import { describe, expect, it } from 'vitest';
import { text } from './rows';

describe('text', () => {
	it('reads a text column', () => {
		expect(text({ username: 'jordan' }, 'username')).toBe('jordan');
	});

	it('reads an empty string rather than treating it as absent', () => {
		expect(text({ note: '' }, 'note')).toBe('');
	});

	it('refuses a null rather than passing on the string "null"', () => {
		expect(() => text({ email: null }, 'email')).toThrow('email');
	});

	it('refuses a number', () => {
		expect(() => text({ age: 32 }, 'age')).toThrow(TypeError);
	});

	it('refuses a column that is not in the row', () => {
		expect(() => text({ username: 'jordan' }, 'display_name')).toThrow('display_name');
	});
});
