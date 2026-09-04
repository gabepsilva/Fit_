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

	it('derives every scheduled lane directory from the tier itself', () => {
		expect(tiers.audit.map(laneOf)).toEqual(['changed-node', 'changed-client', 'full']);
	});

	it('refuses a step that declares no lane artifact', () => {
		expect(() => laneOf({ name: 'test:mutation:mystery', purpose: 'none' })).toThrow(
			'No lane directory declared'
		);
	});
});
