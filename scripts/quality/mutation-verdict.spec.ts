import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { MutationPolicy, MutationReviewLedger, MutationScope } from './mutation-types';
import { parseMutationPolicy } from './mutation-types';
import { evaluateMutationReport, mutantFingerprint, verifyMutationFiles } from './mutation-verdict';

const roots: string[] = [];
const policy: MutationPolicy = {
	version: 1,
	full: {
		aggregateScore: 80
	},
	security: {
		aggregateKilled: 90,
		perFileKilled: 80,
		changedLinesKilled: 100,
		maxTimeouts: 0,
		maxNoCoverage: 0,
		maxErrors: 0
	},
	changed: {
		aggregateKilled: 80,
		perFileKilled: 80,
		changedLinesKilled: 100,
		maxTimeouts: 0,
		maxNoCoverage: 0,
		maxErrors: 0
	}
};

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{ root: string; scope: MutationScope }> {
	const root = await mkdtemp(path.join(tmpdir(), 'fit-mutation-verdict-'));
	roots.push(root);
	await mkdir(path.join(root, 'src'), { recursive: true });
	await writeFile(
		path.join(root, 'src/a.ts'),
		'export function choose(value: boolean) { return value ? 1 : 2; }\n'
	);
	return {
		root,
		scope: {
			version: 2,
			lane: 'security',
			project: 'server',
			base: null,
			fallback: null,
			files: [{ path: 'src/a.ts', changeStatus: 'M', changedLines: [{ start: 1, end: 1 }] }]
		}
	};
}

function mutant(id: string, status: string, line = 1) {
	return {
		id,
		status,
		mutatorName: 'ConditionalExpression',
		replacement: 'false',
		location: { start: { line, column: 0 }, end: { line, column: 1 } }
	};
}

describe('mutation verdict', () => {
	it('rejects a mutation policy with a missing limit instead of disabling its comparison', () => {
		expect(() =>
			parseMutationPolicy({
				...policy,
				changed: {
					aggregateKilled: 80,
					changedLinesKilled: 100,
					maxTimeouts: 0,
					maxNoCoverage: 0,
					maxErrors: 0
				}
			})
		).toThrow('mutation policy.changed must have exactly keys');
	});
	it('counts only explicit kills as positive', async () => {
		const { root, scope } = await fixture();
		const verdict = await evaluateMutationReport({
			projectRoot: root,
			lane: 'security',
			scope,
			policy,
			report: {
				files: {
					'src/a.ts': {
						source: 'export const a = true;',
						mutants: [
							mutant('1', 'Killed'),
							mutant('2', 'Timeout'),
							mutant('3', 'NoCoverage'),
							mutant('4', 'CompileError')
						]
					}
				}
			}
		});
		expect(verdict.killedScore).toBe(25);
		expect(verdict.failures).toEqual(
			expect.arrayContaining([
				expect.stringContaining('timeouts 1'),
				expect.stringContaining('uncovered mutants 1'),
				expect.stringContaining('errored mutants 1')
			])
		);
		expect(verdict.ok).toBe(false);
	});

	it('rejects a changed-line survivor even when the file score passes', async () => {
		const { root, scope } = await fixture();
		const mutants = Array.from({ length: 10 }, (_, index) =>
			mutant(String(index), index === 0 ? 'Survived' : 'Killed', index === 0 ? 1 : 2)
		);
		const verdict = await evaluateMutationReport({
			projectRoot: root,
			lane: 'security',
			scope,
			policy,
			report: { files: { 'src/a.ts': { source: 'export const a = true;', mutants } } }
		});
		expect(verdict.killedScore).toBe(90);
		expect(verdict.failures).toContain('src/a.ts observable changed-line score 0.00 is below 100');
	});

	it('enforces per-file thresholds instead of allowing aggregation to hide a weak file', async () => {
		const { root, scope } = await fixture();
		await writeFile(path.join(root, 'src/b.ts'), 'export const answer = 42;\n');
		scope.files.push({ path: 'src/b.ts', changeStatus: null, changedLines: [] });
		const verdict = await evaluateMutationReport({
			projectRoot: root,
			lane: 'security',
			scope,
			policy,
			report: {
				files: {
					'src/a.ts': {
						source: 'export const a = true;',
						mutants: Array.from({ length: 20 }, (_, index) => mutant(`a${index}`, 'Killed'))
					},
					'src/b.ts': {
						source: 'export const answer = 42;',
						mutants: [mutant('b1', 'Survived'), mutant('b2', 'Killed')]
					}
				}
			}
		});
		expect(verdict.killedScore).toBeGreaterThan(90);
		expect(verdict.failures).toContain('src/b.ts killed-only score 50.00 is below 80');
	});

	it('uses the legacy aggregate only for unchanged files in a broad fallback', async () => {
		const { root, scope } = await fixture();
		const changedSource = 'export function choose(value: boolean) { return value ? 1 : 2; }\n';
		const backgroundSource = 'export const answer = 42;\n';
		await writeFile(path.join(root, 'src/b.ts'), backgroundSource);
		scope.lane = 'changed-node';
		scope.fallback = 'mutation-infrastructure-changed';
		scope.files.push({ path: 'src/b.ts', changeStatus: null, changedLines: [] });
		const verdict = await evaluateMutationReport({
			projectRoot: root,
			lane: 'changed-node',
			scope,
			policy,
			report: {
				files: {
					'src/a.ts': {
						source: changedSource,
						mutants: Array.from({ length: 10 }, (_, index) => mutant(`a${index}`, 'Killed'))
					},
					'src/b.ts': {
						source: backgroundSource,
						mutants: [
							...Array.from({ length: 7 }, (_, index) => mutant(`b${index}`, 'Killed')),
							mutant('b-timeout', 'Timeout'),
							mutant('b-survivor', 'Survived'),
							mutant('b-uncovered', 'NoCoverage')
						]
					}
				}
			}
		});
		expect(verdict.ok).toBe(true);
		expect(verdict.verdictMode).toBe('strict-changed-with-legacy-background');
		expect(verdict.strictFiles).toBe(1);
		expect(verdict.strictKilledScore).toBe(100);
		expect(verdict.backgroundMutationScore).toBe(80);
		expect(verdict.timeout).toBe(1);
		expect(verdict.noCoverage).toBe(1);
	});

	it('rejects a changed production survivor even when fallback background passes', async () => {
		const { root, scope } = await fixture();
		const changedSource = 'export function choose(value: boolean) { return value ? 1 : 2; }\n';
		const backgroundSource = 'export const answer = 42;\n';
		await writeFile(path.join(root, 'src/b.ts'), backgroundSource);
		scope.lane = 'changed-node';
		scope.fallback = 'test-input-changed';
		scope.files.push({ path: 'src/b.ts', changeStatus: null, changedLines: [] });
		const verdict = await evaluateMutationReport({
			projectRoot: root,
			lane: 'changed-node',
			scope,
			policy,
			report: {
				files: {
					'src/a.ts': {
						source: changedSource,
						mutants: [
							mutant('changed-survivor', 'Survived'),
							...Array.from({ length: 9 }, (_, index) => mutant(`a${index}`, 'Killed'))
						]
					},
					'src/b.ts': {
						source: backgroundSource,
						mutants: [
							...Array.from({ length: 8 }, (_, index) => mutant(`b${index}`, 'Killed')),
							mutant('b1', 'Survived'),
							mutant('b2', 'Survived')
						]
					}
				}
			}
		});
		expect(verdict.backgroundMutationScore).toBe(80);
		expect(verdict.failures).toContain('src/a.ts observable changed-line score 90.00 is below 100');
		expect(verdict.ok).toBe(false);
	});

	it('keeps a deletion-only changed production file strict during broad fallback', async () => {
		const { root, scope } = await fixture();
		const source = 'export function choose(value: boolean) { return value ? 1 : 2; }\n';
		scope.lane = 'changed-node';
		scope.fallback = 'test-input-changed';
		scope.files[0] = { path: 'src/a.ts', changeStatus: 'M', changedLines: [] };
		const verdict = await evaluateMutationReport({
			projectRoot: root,
			lane: 'changed-node',
			scope,
			policy,
			report: {
				files: {
					'src/a.ts': {
						source,
						mutants: [
							...Array.from({ length: 9 }, (_, index) => mutant(String(index), 'Killed')),
							mutant('uncovered', 'NoCoverage')
						]
					}
				}
			}
		});
		expect(verdict.strictFiles).toBe(1);
		expect(verdict.files[0]?.observableChangedKilledScore).toBeNull();
		expect(verdict.failures).toContain('strict changed uncovered mutants 1 exceed 0');
		expect(verdict.ok).toBe(false);
	});

	it('fails closed when a scope omits explicit changed-production identity', async () => {
		const { root, scope } = await fixture();
		delete (scope.files[0] as Partial<(typeof scope.files)[number]>).changeStatus;
		const verdict = await evaluateMutationReport({
			projectRoot: root,
			lane: 'security',
			scope,
			policy,
			report: {
				files: {
					'src/a.ts': {
						source: 'export function choose(value: boolean) { return value ? 1 : 2; }\n',
						mutants: [mutant('1', 'Killed')]
					}
				}
			}
		});
		expect(verdict.failures).toContain('mutation scope has invalid change status: src/a.ts');
		expect(verdict.ok).toBe(false);
	});

	it('keeps every file strict in a normal changed scope', async () => {
		const { root, scope } = await fixture();
		const backgroundSource = 'export const answer = 42;\n';
		await writeFile(path.join(root, 'src/b.ts'), backgroundSource);
		scope.lane = 'changed-node';
		scope.files.push({ path: 'src/b.ts', changeStatus: null, changedLines: [] });
		const verdict = await evaluateMutationReport({
			projectRoot: root,
			lane: 'changed-node',
			scope,
			policy,
			report: {
				files: {
					'src/a.ts': {
						source: 'export function choose(value: boolean) { return value ? 1 : 2; }\n',
						mutants: [mutant('a', 'Killed')]
					},
					'src/b.ts': {
						source: backgroundSource,
						mutants: [mutant('b1', 'Killed'), mutant('b2', 'Survived')]
					}
				}
			}
		});
		expect(verdict.strictFiles).toBe(2);
		expect(verdict.failures).toContain('src/b.ts killed-only score 50.00 is below 80');
	});

	it('rejects reports outside the discovered scope and omitted executable files', async () => {
		const { root, scope } = await fixture();
		const verdict = await evaluateMutationReport({
			projectRoot: root,
			lane: 'security',
			scope,
			policy,
			report: {
				files: {
					'src/other.ts': { source: 'export const other = true;', mutants: [mutant('1', 'Killed')] }
				}
			}
		});
		expect(verdict.failures).toEqual(
			expect.arrayContaining([
				expect.stringContaining('outside scope'),
				expect.stringContaining('omitted executable scoped files')
			])
		);
	});

	it('rejects an omitted class property initializer', async () => {
		const { root, scope } = await fixture();
		await writeFile(path.join(root, 'src/a.ts'), 'export class Settings { enabled = true; }\n');
		const verdict = await evaluateMutationReport({
			projectRoot: root,
			lane: 'security',
			scope,
			policy,
			report: { files: {} }
		});
		expect(verdict.failures).toContain('report omitted executable scoped files: src/a.ts');
	});

	it.each([
		['a default-exported literal', 'export default true;\n'],
		['an enum member initializer', "export enum Mode { Ready = 'ready' }\n"],
		['a side-effect call', 'declare function boot(enabled: boolean): void;\nboot(true);\n'],
		['a constructed value', "new Worker('worker.js');\n"],
		['a top-level throw', "throw new Error('stopped');\n"],
		['a prefix update', 'let count = 0;\n++count;\n'],
		['a postfix update', 'let count = 0;\ncount++;\n']
	])('does not let another file mask omitted executable code in %s', async (_, omittedSource) => {
		const { root, scope } = await fixture();
		await writeFile(path.join(root, 'src/b.ts'), omittedSource);
		scope.files.push({ path: 'src/b.ts', changeStatus: null, changedLines: [] });
		const source = 'export function choose(value: boolean) { return value ? 1 : 2; }\n';
		const verdict = await evaluateMutationReport({
			projectRoot: root,
			lane: 'security',
			scope,
			policy,
			report: {
				files: {
					'src/a.ts': {
						source,
						mutants: Array.from({ length: 10 }, (_, index) => mutant(String(index), 'Killed'))
					}
				}
			}
		});
		expect(verdict.failures).toContain('report omitted executable scoped files: src/b.ts');
	});

	it('allows an empty changed lane but never an empty security lane', async () => {
		const { root, scope } = await fixture();
		scope.files = [];
		const security = await evaluateMutationReport({
			projectRoot: root,
			lane: 'security',
			scope,
			policy,
			report: { files: {} }
		});
		scope.lane = 'changed-node';
		const changed = await evaluateMutationReport({
			projectRoot: root,
			lane: 'changed-node',
			scope,
			policy,
			report: { files: {} }
		});
		expect(security.ok).toBe(false);
		expect(changed.ok).toBe(true);
	});

	it('rejects a report that predates the current run', async () => {
		const { root, scope } = await fixture();
		const scopePath = path.join(root, 'scope.json');
		const reportPath = path.join(root, 'mutation.json');
		const policyPath = path.join(root, 'policy.json');
		const ledgerPath = path.join(root, 'ledger.json');
		await Promise.all([
			writeFile(scopePath, JSON.stringify(scope)),
			writeFile(reportPath, JSON.stringify({ files: {} })),
			writeFile(policyPath, JSON.stringify(policy)),
			writeFile(ledgerPath, JSON.stringify({ version: 1, entries: [] }))
		]);
		await expect(
			verifyMutationFiles({
				projectRoot: root,
				lane: 'security',
				scopePath,
				reportPath,
				policyPath,
				ledgerPath,
				verdictPath: path.join(root, 'verdict.json'),
				startedAt: Date.now() + 1000
			})
		).rejects.toThrow('Mutation report is stale.');
	});

	it('accepts only an exact, reviewed survivor fingerprint on a changed line', async () => {
		const { root, scope } = await fixture();
		const source = 'export function choose(value: boolean) { return value ? 1 : 2; }\n';
		const survivor = mutant('reviewed', 'Survived');
		const sourceHash = createHash('sha256').update(source).digest('hex');
		const entry = {
			file: 'src/a.ts',
			mutatorName: survivor.mutatorName,
			replacement: survivor.replacement,
			location: survivor.location,
			sourceHash,
			classification: 'equivalent' as const,
			rationale:
				'The replacement returns the same externally observable value for every valid input.',
			review: 'https://github.com/gabepsilva/Fit_/pull/5'
		};
		const ledger: MutationReviewLedger = {
			version: 1,
			entries: [{ ...entry, fingerprint: mutantFingerprint(entry) }]
		};
		const verdict = await evaluateMutationReport({
			projectRoot: root,
			lane: 'security',
			scope,
			policy,
			ledger,
			report: {
				files: {
					'src/a.ts': {
						source,
						mutants: [
							survivor,
							...Array.from({ length: 9 }, (_, index) => mutant(String(index), 'Killed'))
						]
					}
				}
			}
		});
		expect(verdict.ok).toBe(true);
		expect(verdict.reviewedSurvivors).toBe(1);
		expect(verdict.files[0]?.reviewedChangedSurvivors).toBe(1);
		expect(verdict.files[0]?.observableChangedKilledScore).toBe(100);
	});

	it('invalidates a review when the scoped source no longer matches its report', async () => {
		const { root, scope } = await fixture();
		const oldSource = 'export function choose(value: boolean) { return value ? 1 : 2; }\n';
		const survivor = mutant('reviewed', 'Survived');
		const entry = {
			file: 'src/a.ts',
			mutatorName: survivor.mutatorName,
			replacement: survivor.replacement,
			location: survivor.location,
			sourceHash: createHash('sha256').update(oldSource).digest('hex'),
			classification: 'equivalent' as const,
			rationale:
				'The old source made this replacement observationally identical for every valid input.',
			review: 'https://github.com/gabepsilva/Fit_/pull/5'
		};
		await writeFile(
			path.join(root, 'src/a.ts'),
			'export function choose(value: boolean) { return value ? 3 : 4; }\n'
		);
		const verdict = await evaluateMutationReport({
			projectRoot: root,
			lane: 'security',
			scope,
			policy,
			ledger: { version: 1, entries: [{ ...entry, fingerprint: mutantFingerprint(entry) }] },
			report: { files: { 'src/a.ts': { source: oldSource, mutants: [survivor] } } }
		});
		expect(verdict.failures).toEqual(
			expect.arrayContaining([
				expect.stringContaining('report source does not match scoped file'),
				expect.stringContaining('stale or no longer survives')
			])
		);
	});

	it('preserves the historical Stryker score for the full-tree compatibility audit', async () => {
		const { root, scope } = await fixture();
		scope.lane = 'full';
		scope.project = 'all';
		const source = 'export function choose(value: boolean) { return value ? 1 : 2; }\n';
		const verdict = await evaluateMutationReport({
			projectRoot: root,
			lane: 'full',
			scope,
			policy,
			report: {
				files: {
					'src/a.ts': {
						source,
						mutants: [
							...Array.from({ length: 7 }, (_, index) => mutant(String(index), 'Killed')),
							mutant('timeout', 'Timeout'),
							mutant('survivor', 'Survived'),
							mutant('uncovered', 'NoCoverage'),
							mutant('compile', 'CompileError')
						]
					}
				}
			}
		});
		expect(verdict.mutationScore).toBe(80);
		expect(verdict.ok).toBe(true);
	});

	it('rejects broad or stale reviewed-mutant entries', async () => {
		const { root, scope } = await fixture();
		const survivor = mutant('reviewed', 'Survived');
		const entry = {
			file: 'src/*.ts',
			mutatorName: survivor.mutatorName,
			replacement: survivor.replacement,
			location: survivor.location,
			sourceHash: '0'.repeat(64),
			classification: 'equivalent' as const,
			rationale: 'A deliberately invalid broad entry that must never classify a concrete survivor.',
			review: 'https://github.com/gabepsilva/Fit_/pull/5'
		};
		const verdict = await evaluateMutationReport({
			projectRoot: root,
			lane: 'security',
			scope,
			policy,
			ledger: { version: 1, entries: [{ ...entry, fingerprint: mutantFingerprint(entry) }] },
			report: {
				files: {
					'src/a.ts': { source: 'export const a = true;', mutants: [survivor] }
				}
			}
		});
		expect(verdict.failures).toEqual(
			expect.arrayContaining([
				expect.stringContaining('invalid reviewed-mutant entry'),
				expect.stringContaining('changed-line score')
			])
		);
	});

	it('rejects an unsupported ledger version and classification at runtime', async () => {
		const { root, scope } = await fixture();
		const verdict = await evaluateMutationReport({
			projectRoot: root,
			lane: 'security',
			scope,
			policy,
			ledger: {
				version: 2,
				entries: [{ classification: 'all-survivors' }]
			} as unknown as MutationReviewLedger,
			report: { files: {} }
		});
		expect(verdict.failures).toContain(
			'reviewed-mutant ledger must have version 1 and an entries array'
		);
	});
});
