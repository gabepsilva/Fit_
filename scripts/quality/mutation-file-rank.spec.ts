import { describe, expect, it } from 'vitest';
import {
	describeMutant,
	isDebtStatus,
	mutantSnippet,
	rankFilesBySurvivors
} from './mutation-file-rank';

describe('mutation file ranking', () => {
	it('treats Survived, NoCoverage and Timeout as debt, Killed as not', () => {
		expect(isDebtStatus('Survived')).toBe(true);
		expect(isDebtStatus('NoCoverage')).toBe(true);
		expect(isDebtStatus('Timeout')).toBe(true);
		expect(isDebtStatus('Killed')).toBe(false);
	});

	it('returns nothing for a null report', () => {
		expect(rankFilesBySurvivors(null)).toEqual([]);
	});

	it('ranks files worst-first by total debt mutants, ignoring Killed', () => {
		const report = {
			files: {
				'a.ts': {
					mutants: [
						{
							status: 'Survived',
							mutatorName: 'M',
							replacement: 'x',
							location: { start: { line: 1, column: 0 } }
						},
						{
							status: 'Killed',
							mutatorName: 'M',
							replacement: 'x',
							location: { start: { line: 2, column: 0 } }
						}
					]
				},
				'b.ts': {
					mutants: [
						{
							status: 'Survived',
							mutatorName: 'M',
							replacement: 'x',
							location: { start: { line: 1, column: 0 } }
						},
						{
							status: 'NoCoverage',
							mutatorName: 'M',
							replacement: 'x',
							location: { start: { line: 2, column: 0 } }
						},
						{
							status: 'Timeout',
							mutatorName: 'M',
							replacement: 'x',
							location: { start: { line: 3, column: 0 } }
						}
					]
				},
				'c.ts': {
					mutants: [
						{
							status: 'Killed',
							mutatorName: 'M',
							replacement: 'x',
							location: { start: { line: 1, column: 0 } }
						}
					]
				}
			}
		};

		const ranked = rankFilesBySurvivors(report);

		expect(ranked.map((row) => row.file)).toEqual(['b.ts', 'a.ts']);
		expect(ranked[0]).toMatchObject({
			file: 'b.ts',
			survived: 1,
			noCoverage: 1,
			timeout: 1,
			total: 3
		});
		expect(ranked[1]).toMatchObject({
			file: 'a.ts',
			survived: 1,
			noCoverage: 0,
			timeout: 0,
			total: 1
		});
	});

	it('breaks a tie in total debt alphabetically by file', () => {
		const report = {
			files: {
				'z.ts': {
					mutants: [
						{
							status: 'Survived',
							mutatorName: 'M',
							replacement: 'x',
							location: { start: { line: 1, column: 0 } }
						}
					]
				},
				'a.ts': {
					mutants: [
						{
							status: 'Survived',
							mutatorName: 'M',
							replacement: 'x',
							location: { start: { line: 1, column: 0 } }
						}
					]
				}
			}
		};

		expect(rankFilesBySurvivors(report).map((row) => row.file)).toEqual(['a.ts', 'z.ts']);
	});

	it('slices the original text out of the source line for a single-line mutant', () => {
		const source = 'const total = a + b;\nconst other = 1;\n';
		const mutant = {
			status: 'Survived',
			mutatorName: 'ArithmeticOperator',
			replacement: 'a - b',
			location: { start: { line: 1, column: 14 }, end: { line: 1, column: 19 } }
		};

		expect(mutantSnippet(source, mutant)).toBe('a + b → a - b');
	});

	it('falls back to the whole start line for a multi-line mutant', () => {
		const source = 'function f() {\n  return 1;\n}\n';
		const mutant = {
			status: 'Survived',
			mutatorName: 'BlockStatement',
			replacement: '{}',
			location: { start: { line: 1, column: 13 }, end: { line: 3, column: 1 } }
		};

		expect(mutantSnippet(source, mutant)).toBe('function f() { → {}');
	});

	it('falls back to the bare replacement when no source is available', () => {
		const mutant = {
			status: 'Survived',
			mutatorName: 'M',
			replacement: 'x',
			location: { start: { line: 1, column: 0 } }
		};

		expect(mutantSnippet(undefined, mutant)).toBe('x');
	});

	it('describes a mutant with mutator name, line and snippet together', () => {
		const source = 'const total = a + b;\n';
		const mutant = {
			status: 'Survived',
			mutatorName: 'ArithmeticOperator',
			replacement: 'a - b',
			location: { start: { line: 1, column: 14 }, end: { line: 1, column: 19 } }
		};

		expect(describeMutant(source, mutant)).toBe('ArithmeticOperator line 1: a + b → a - b');
	});
});
