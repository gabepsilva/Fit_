import { describe, expect, it } from 'vitest';
import { normalizeUsername, usernameProblem } from './username';

describe('normalizeUsername', () => {
	it('lowercases, so one name cannot be registered twice in two cases', () => {
		expect(normalizeUsername('Jordan')).toBe('jordan');
	});

	it('trims surrounding whitespace', () => {
		expect(normalizeUsername('  jordan  ')).toBe('jordan');
	});

	it('folds compatibility forms to their plain equivalents', () => {
		// The full-width Latin letters of "jordan": a different string that renders
		// as the same name. Escaped so the point survives a copy-paste.
		expect(normalizeUsername('\uFF4A\uFF4F\uFF52\uFF44\uFF41\uFF4E')).toBe('jordan');
	});
});

describe('usernameProblem', () => {
	it('accepts an ordinary name', () => {
		expect(usernameProblem('jordan')).toBeNull();
	});

	it('accepts names exactly at both normalized length boundaries', () => {
		expect(usernameProblem('abc')).toBeNull();
		expect(usernameProblem('a'.repeat(32))).toBeNull();
	});

	it('accepts the separators people actually type', () => {
		expect(usernameProblem('jordan.p_2-b')).toBeNull();
	});

	it('accepts a name that only normalization makes valid', () => {
		expect(usernameProblem('  Jordan  ')).toBeNull();
	});

	it('rejects a name shorter than three characters', () => {
		expect(usernameProblem('jo')).toBe('too-short');
	});

	it('rejects a name longer than thirty-two characters', () => {
		expect(usernameProblem('j'.repeat(33))).toBe('too-long');
	});

	it('rejects raw input beyond the normalization limit', () => {
		// Trimming would make this valid, so this specifically proves that the raw
		// allocation bound runs before normalization rather than being redundant
		// with the normalized 32-character limit.
		expect(usernameProblem(`${' '.repeat(126)}abc`)).toBe('too-long');
	});

	it('allows the raw-input limit when normalization safely shrinks it', () => {
		expect(usernameProblem(`${' '.repeat(125)}abc`)).toBeNull();
	});

	it('rejects a separator in the leading position', () => {
		expect(usernameProblem('.jordan')).toBe('unsupported-characters');
	});

	it('rejects spaces inside the name', () => {
		expect(usernameProblem('jordan p')).toBe('unsupported-characters');
	});

	it('rejects a Cyrillic lookalike that would impersonate an existing name', () => {
		// U+043E CYRILLIC SMALL LETTER O renders identically to ASCII "o", so this
		// is a different string that displays as a name somebody else registered.
		expect(usernameProblem('jordan'.replace('o', '\u043E'))).toBe('unsupported-characters');
	});
});
