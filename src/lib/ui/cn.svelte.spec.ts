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

	it('keeps utilities from different groups', () => {
		expect(cn('p-2', 'm-4')).toBe('p-2 m-4');
	});

	// Guards the no-merge contract: callers pick one utility per group, `cn` never does.
	it('does not resolve two utilities from the same group', () => {
		expect(cn('p-2', 'p-4')).toBe('p-2 p-4');
	});

	it('returns an empty string for no input', () => {
		expect(cn()).toBe('');
	});
});
