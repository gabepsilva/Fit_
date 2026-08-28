import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
	it('joins class names', () => {
		expect(cn('a', 'b')).toBe('a b');
	});

	it('drops falsy values', () => {
		const off = false;
		expect(cn('a', off && 'b', undefined, null)).toBe('a');
	});

	it('lets a later Tailwind utility win over an earlier one in the same group', () => {
		expect(cn('p-2', 'p-4')).toBe('p-4');
	});

	it('keeps utilities from different groups', () => {
		expect(cn('p-2', 'm-4')).toBe('p-2 m-4');
	});

	it('returns an empty string for no input', () => {
		expect(cn()).toBe('');
	});
});
