import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CRASH_EXIT_CODE } from './run-outcome';

/**
 * What a mutation lane reports when it never reached a verdict.
 *
 * The lane has two ways to end red and they mean opposite things. Surviving
 * mutants mean the tests are weak. A runner that died — Stryker's dry run
 * failing to start vitest, for one — means nothing was measured at all, and the
 * empty report directory it leaves behind looks exactly like the weak-test
 * case from outside. This record and the message below exist to say which one
 * happened, name the artifact that is missing, and carry the underlying error
 * instead of an exit code that implies debt.
 */
export interface MutationCrash {
	lane: string;
	/** The verdict the lane could not reach; never a score, because none was measured. */
	verdict: 'crashed';
	/** The report Stryker was to write, relative to the project root. */
	missingArtifact: string;
	/** False whenever the runner died before publishing the report. */
	reportWritten: boolean;
	/** Stryker's own exit code, or 0 when the lane never invoked it. */
	strykerExitCode: number;
	/** The error that stopped the verdict being computed. */
	error: string;
	exitCode: number;
	crashedAt: string;
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function describeMutationCrash(options: {
	projectRoot: string;
	lane: string;
	reportPath: string;
	strykerExitCode: number;
	error: unknown;
}): Promise<MutationCrash> {
	const reportWritten = await stat(options.reportPath).then(
		() => true,
		() => false
	);
	return {
		lane: options.lane,
		verdict: 'crashed',
		missingArtifact: path.relative(options.projectRoot, options.reportPath),
		reportWritten,
		strykerExitCode: options.strykerExitCode,
		error: messageOf(options.error),
		exitCode: CRASH_EXIT_CODE,
		crashedAt: new Date().toISOString()
	};
}

/**
 * Written beside the lane's other artifacts so the crash is machine-readable
 * where a verdict would otherwise sit, and cannot be read as a score of zero.
 */
export async function recordMutationCrash(crashPath: string, crash: MutationCrash): Promise<void> {
	await writeFile(crashPath, `${JSON.stringify(crash, null, '\t')}\n`);
}

export function formatMutationCrash(crash: MutationCrash, crashRecord: string): string {
	const artifact = crash.reportWritten
		? `unusable artifact: ${crash.missingArtifact}`
		: `missing artifact: ${crash.missingArtifact} (Stryker exited ${crash.strykerExitCode} without writing it)`;
	return [
		`${crash.lane} mutation lane CRASHED: it produced no verdict, so nothing was measured.`,
		'  This is not mutation debt. No mutant survived here, because no mutant was judged.',
		`  ${artifact}`,
		`  underlying error: ${crash.error}`,
		`  crash record: ${crashRecord}`,
		`  Exit ${crash.exitCode} means "the run did not happen"; exit 1 means "the change is under-tested".`,
		'  Re-run the lane, and if it crashes again report the crash rather than the score.'
	].join('\n');
}
