import { describe, expect, it } from 'vitest';
import { combineReports, formatDebtPlan, WORST_FILES_PER_PASS } from './debt-pay';

function survived(line: number, mutatorName = 'M', replacement = 'x') {
	return { status: 'Survived', mutatorName, replacement, location: { start: { line, column: 0 } } };
}

describe('combineReports', () => {
	it('uses the full lane alone when it ran, since it already covers everything', () => {
		const combined = combineReports({
			full: { files: { 'a.ts': { mutants: [survived(1)] } } },
			'changed-node': { files: { 'b.ts': { mutants: [survived(1)] } } }
		});

		expect(Object.keys(combined.files)).toEqual(['a.ts']);
	});

	it('merges the two changed lanes when the full lane did not run', () => {
		const combined = combineReports({
			full: null,
			'changed-node': { files: { 'a.ts': { mutants: [survived(1)] } } },
			'changed-client': { files: { 'b.ts': { mutants: [survived(2)] } } }
		});

		expect(Object.keys(combined.files).sort()).toEqual(['a.ts', 'b.ts']);
	});

	it('concatenates mutants when both changed lanes name the same file', () => {
		const combined = combineReports({
			full: null,
			'changed-node': { files: { 'a.ts': { mutants: [survived(1)] } } },
			'changed-client': { files: { 'a.ts': { mutants: [survived(2)] } } }
		});

		expect(combined.files['a.ts']?.mutants).toHaveLength(2);
	});

	it('returns an empty report when nothing ran', () => {
		expect(combineReports({ full: null, 'changed-node': null, 'changed-client': null })).toEqual({
			files: {}
		});
	});
});

describe('formatDebtPlan', () => {
	it('says there is nothing to pay down when no mutant survived', () => {
		expect(formatDebtPlan({ files: {} })).toContain('Nothing to pay down.');
	});

	it('names the worst files, worst first, each with its surviving mutants', () => {
		const report: Parameters<typeof formatDebtPlan>[0] = {
			files: {
				'a.ts': { source: 'const x = 1;\n', mutants: [survived(1, 'EqualityOperator', '2')] },
				'b.ts': {
					source: 'const y = a + b;\n',
					mutants: [
						{
							status: 'Survived',
							mutatorName: 'ArithmeticOperator',
							replacement: 'a - b',
							location: { start: { line: 1, column: 10 }, end: { line: 1, column: 15 } }
						},
						survived(1, 'ArithmeticOperator', 'a * b')
					]
				}
			}
		};

		const plan = formatDebtPlan(report);

		expect(plan).toContain('## Mutation debt plan');
		expect(plan.indexOf('b.ts')).toBeLessThan(plan.indexOf('a.ts'));
		expect(plan).toContain('ArithmeticOperator line 1: a + b → a - b');
		expect(plan).toContain('equivalent-mutant call in the PR body');
	});

	it('caps at the requested worst-file count', () => {
		const report: Parameters<typeof formatDebtPlan>[0] = {
			files: {
				'a.ts': { mutants: [survived(1)] },
				'b.ts': { mutants: [survived(1), survived(2)] },
				'c.ts': { mutants: [survived(1), survived(2), survived(3)] },
				'd.ts': { mutants: [survived(1), survived(2), survived(3), survived(4)] }
			}
		};

		const plan = formatDebtPlan(report, 2);

		expect(plan).toContain('d.ts');
		expect(plan).toContain('c.ts');
		expect(plan).not.toContain('b.ts');
		expect(plan).not.toContain('a.ts');
	});

	it('defaults to the three-file pass QUALITY.md documents', () => {
		expect(WORST_FILES_PER_PASS).toBe(3);
	});
});
