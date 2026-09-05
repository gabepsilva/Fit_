import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	MAX_SURVIVORS_PER_LANE,
	collectMutationDebt,
	laneOf,
	survivorLines,
	type JsonReader
} from './mutation-debt';
import { tiers } from './gates';

function reader(files: Record<string, unknown>): JsonReader {
	return (file) =>
		Promise.resolve(files[path.basename(path.dirname(file)) + '/' + path.basename(file)] ?? null);
}

const failingVerdict = {
	ok: false,
	killedScore: 62.5,
	mutationScore: 71,
	survived: 2,
	timeout: 1,
	noCoverage: 0,
	failures: ['changed-line killed score 62.50 is below 100']
};

function strykerReport(count: number) {
	return {
		files: {
			'src/lib/domain/tdee.ts': {
				mutants: Array.from({ length: count }, (_, index) => ({
					status: 'Survived',
					mutatorName: 'ArithmeticOperator',
					replacement: '-',
					location: { start: { line: index + 1, column: 1 } }
				}))
			}
		}
	};
}

describe('scheduled mutation debt report', () => {
	it('reports debt and names the mutants a non-blocking lane left alive', async () => {
		const report = await collectMutationDebt(
			'reports/mutation',
			['changed-node'],
			reader({
				'changed-node/verdict.json': failingVerdict,
				'changed-node/mutation.json': strykerReport(2)
			})
		);

		expect(report.debt).toBe(true);
		expect(report.body).toContain('debt to pay');
		expect(report.body).toContain('src/lib/domain/tdee.ts:1');
		expect(report.body).toContain('changed-line killed score 62.50 is below 100');
		expect(report.warnings).toEqual([
			'changed-node reported mutation debt: changed-line killed score 62.50 is below 100'
		]);
	});

	it('caps the survivor list so the issue body stays inside GitHub limits', async () => {
		const report = await collectMutationDebt(
			'reports/mutation',
			['full'],
			reader({
				'full/verdict.json': failingVerdict,
				'full/mutation.json': strykerReport(MAX_SURVIVORS_PER_LANE + 4)
			})
		);

		expect(report.body).toContain(`…and 4 more`);
	});

	it('treats a crash as debt, because a lane that never judged proves nothing', async () => {
		const report = await collectMutationDebt(
			'reports/mutation',
			['full'],
			reader({
				'full/crash.json': {
					missingArtifact: 'reports/mutation/full/mutation.json',
					strykerExitCode: 1,
					error: 'vitest failed to start'
				}
			})
		);

		expect(report.debt).toBe(true);
		expect(report.body).toContain('crashed, no verdict');
		expect(report.warnings).toEqual(['full crashed without a verdict: vitest failed to start']);
	});

	it('reports no debt when every lane reached a passing verdict', async () => {
		const report = await collectMutationDebt(
			'reports/mutation',
			['changed-node'],
			reader({
				'changed-node/verdict.json': {
					ok: true,
					killedScore: 100,
					mutationScore: 100,
					survived: 0,
					timeout: 0,
					noCoverage: 0,
					failures: []
				}
			})
		);

		expect(report.debt).toBe(false);
		expect(report.body).toContain('clean');
		expect(report.warnings).toEqual([]);
	});

	it('says a skipped lane was skipped instead of calling it clean', async () => {
		const report = await collectMutationDebt('reports/mutation', ['changed-client'], reader({}));

		expect(report.debt).toBe(false);
		expect(report.body).toContain('not run');
	});

	it('counts uncovered and timed-out mutants as debt, not only survivors', () => {
		const lines = survivorLines({
			files: {
				'a.ts': {
					mutants: [
						{
							status: 'Killed',
							mutatorName: 'M',
							replacement: 'x',
							location: { start: { line: 1, column: 1 } }
						},
						{
							status: 'NoCoverage',
							mutatorName: 'M',
							replacement: 'x',
							location: { start: { line: 2, column: 1 } }
						},
						{
							status: 'Timeout',
							mutatorName: 'M',
							replacement: 'x',
							location: { start: { line: 3, column: 1 } }
						}
					]
				}
			}
		});

		expect(lines).toHaveLength(2);
		expect(lines.join('\n')).not.toContain('Killed');
	});

	it('reports debt for a lane that passes its own threshold but still has survivors (#87 option 1)', async () => {
		const report = await collectMutationDebt(
			'reports/mutation',
			['full'],
			reader({
				'full/verdict.json': {
					ok: true,
					killedScore: 96.68,
					mutationScore: 96.68,
					survived: 131,
					timeout: 7,
					noCoverage: 5,
					failures: []
				},
				'full/mutation.json': strykerReport(2)
			})
		);

		expect(report.debt).toBe(true);
		expect(report.survivorCount).toBe(143);
		expect(report.body).toContain('Passes its own threshold');
		expect(report.warnings).toEqual([
			'full reported 143 surviving mutant(s) despite passing its own threshold'
		]);
	});

	it('states the old aggregate-only rule and the new every-survivor rule in the header', async () => {
		const report = await collectMutationDebt('reports/mutation', ['changed-client'], reader({}));

		expect(report.body).toContain('Old rule:');
		expect(report.body).toContain('New rule (2026-09-05, #87):');
	});

	it('sums survivors across lanes and flags a crash separately from survivor debt', async () => {
		const report = await collectMutationDebt(
			'reports/mutation',
			['changed-node', 'full'],
			reader({
				'changed-node/verdict.json': failingVerdict,
				'changed-node/mutation.json': strykerReport(2),
				'full/crash.json': {
					missingArtifact: 'reports/mutation/full/mutation.json',
					strykerExitCode: 1,
					error: 'vitest failed to start'
				}
			})
		);

		expect(report.crashed).toBe(true);
		expect(report.survivorCount).toBe(3);
	});

	it('lists files with survivors worst-first and describes mutants for the worst files', async () => {
		const source = 'const total = a + b;\nconst other = 1;\nconst third = 1;\n';
		const report = await collectMutationDebt(
			'reports/mutation',
			['changed-node'],
			reader({
				'changed-node/verdict.json': failingVerdict,
				'changed-node/mutation.json': {
					files: {
						'src/lib/domain/tdee.ts': {
							source,
							mutants: [
								{
									status: 'Survived',
									mutatorName: 'ArithmeticOperator',
									replacement: 'a - b',
									location: { start: { line: 1, column: 14 }, end: { line: 1, column: 19 } }
								},
								{
									status: 'Survived',
									mutatorName: 'M',
									replacement: 'x',
									location: { start: { line: 2, column: 0 } }
								},
								{
									status: 'Killed',
									mutatorName: 'M',
									replacement: 'x',
									location: { start: { line: 3, column: 0 } }
								}
							]
						},
						'src/lib/domain/quiet.ts': {
							source: 'const x = 1;\n',
							mutants: [
								{
									status: 'NoCoverage',
									mutatorName: 'M',
									replacement: '2',
									location: { start: { line: 1, column: 10 } }
								}
							]
						}
					}
				}
			})
		);

		expect(report.body).toContain('Files with survivors, worst first:');
		expect(report.body.indexOf('src/lib/domain/tdee.ts')).toBeLessThan(
			report.body.indexOf('src/lib/domain/quiet.ts')
		);
		expect(report.body).toContain('ArithmeticOperator line 1: a + b → a - b');
	});

	it('derives every scheduled lane directory from the tier itself', () => {
		expect(tiers.audit.map(laneOf)).toEqual(['changed-node', 'changed-client', 'full']);
	});

	it('refuses a step that declares no lane artifact', () => {
		expect(() => laneOf({ name: 'test:mutation:mystery', purpose: 'none' })).toThrow(
			'No lane directory declared'
		);
	});
});
