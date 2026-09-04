/**
 * The exit-code contract that separates "the gate ran and judged the change"
 * from "the gate never ran".
 *
 * Exit 1 is a verdict: a step measured something and found it wanting. A
 * runner that died before it could measure anything has no verdict to give,
 * and reporting that as exit 1 makes a crashed runner indistinguishable from
 * real debt. That is not a cosmetic difference — a crashed mutation lane and a
 * lane with surviving mutants both left an exit 1 and a report directory
 * holding only `scope.json`, and the crash was worked as debt that did not
 * exist. A runner that produced no verdict exits `CRASH_EXIT_CODE` instead.
 *
 * 97 sits outside the ranges already spoken for: below 125, which shells
 * reserve for signals and for a command that could not be executed, and clear
 * of the small codes test runners and linters return for findings.
 */
export const CRASH_EXIT_CODE = 97;

export type StepOutcome = 'passed' | 'failed' | 'crashed';

/** A crash is never a pass, and never a failing verdict either. */
export function stepOutcome(exitCode: number): StepOutcome {
	if (exitCode === 0) return 'passed';
	return exitCode === CRASH_EXIT_CODE ? 'crashed' : 'failed';
}

export interface OutcomeSummary {
	ok: boolean;
	/** Steps that ran and returned a failing verdict. */
	failed: string[];
	/** Steps that never produced a verdict, so they prove nothing either way. */
	crashed: string[];
}

/**
 * Keeps the two kinds of red in separate lists, so a reader of
 * `reports/quality/gate-<tier>.json` cannot take a crash for debt.
 */
export function summarizeOutcomes(
	steps: readonly { name: string; outcome: StepOutcome }[]
): OutcomeSummary {
	const failed = steps.filter((step) => step.outcome === 'failed').map((step) => step.name);
	const crashed = steps.filter((step) => step.outcome === 'crashed').map((step) => step.name);
	return { ok: failed.length === 0 && crashed.length === 0, failed, crashed };
}

/**
 * A tier that only crashed reports the crash status onward, so the distinction
 * survives to whatever read the runner's exit code.
 */
export function summaryExitCode(summary: OutcomeSummary): number {
	if (summary.ok) return 0;
	return summary.failed.length === 0 ? CRASH_EXIT_CODE : 1;
}
