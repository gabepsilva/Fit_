import { describe, expect, it } from 'vitest';
import { CRASH_EXIT_CODE, stepOutcome, summarizeOutcomes, summaryExitCode } from './run-outcome';

describe('step outcome', () => {
	it('reads a zero exit as a pass', () => {
		expect(stepOutcome(0)).toBe('passed');
	});

	it('reads an ordinary non-zero exit as a verdict against the change', () => {
		expect(stepOutcome(1)).toBe('failed');
		expect(stepOutcome(2)).toBe('failed');
	});

	it('reads the crash status as a run that never produced a verdict', () => {
		expect(stepOutcome(CRASH_EXIT_CODE)).toBe('crashed');
	});

	it('keeps the crash status clear of the codes a finding uses', () => {
		expect(CRASH_EXIT_CODE).toBeGreaterThan(2);
		expect(CRASH_EXIT_CODE).toBeLessThan(125);
	});
});

describe('gate report summary', () => {
	it('files a crashed step apart from a failing one, so neither reads as the other', () => {
		const summary = summarizeOutcomes([
			{ name: 'lint', outcome: 'passed' },
			{ name: 'test:coverage', outcome: 'failed' },
			{ name: 'test:mutation:security', outcome: 'crashed' }
		]);
		expect(summary.failed).toStrictEqual(['test:coverage']);
		expect(summary.crashed).toStrictEqual(['test:mutation:security']);
		expect(summary.ok).toBe(false);
	});

	it('never reports a crashed-only run as passing', () => {
		const summary = summarizeOutcomes([
			{ name: 'format:check', outcome: 'passed' },
			{ name: 'test:mutation:security', outcome: 'crashed' }
		]);
		expect(summary.ok).toBe(false);
		expect(summary.failed).toStrictEqual([]);
		expect(summary.crashed).toStrictEqual(['test:mutation:security']);
	});

	it('passes only when nothing failed and nothing crashed', () => {
		const summary = summarizeOutcomes([{ name: 'lint', outcome: 'passed' }]);
		expect(summary).toStrictEqual({ ok: true, failed: [], crashed: [] });
		expect(summaryExitCode(summary)).toBe(0);
	});

	it('carries the crash status onward when only crashes made the tier red', () => {
		expect(summaryExitCode({ ok: false, failed: [], crashed: ['test:mutation:full'] })).toBe(
			CRASH_EXIT_CODE
		);
	});

	it('reports an ordinary failure whenever any step returned a real verdict', () => {
		expect(summaryExitCode({ ok: false, failed: ['knip'], crashed: ['test:mutation:full'] })).toBe(
			1
		);
	});
});
