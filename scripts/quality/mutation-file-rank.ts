/**
 * Ranks a Stryker mutation report by how much debt each file owes.
 *
 * Both the scheduled audit's debt report (`mutation-debt.ts`) and the
 * `debt:pay` routine (`debt-pay.ts`) need the same answer to "which files are
 * worst": every mutant Stryker did not kill, grouped by file, worst file
 * first. Pulling that ranking into its own pure module means neither caller
 * carries IO, and a mutant description is worded identically wherever an
 * agent reads it.
 */

interface MutantLocation {
	start: { line: number; column: number };
	end?: { line: number; column: number };
}

export interface Mutant {
	status: string;
	mutatorName: string;
	replacement: string;
	location: MutantLocation;
}

interface StrykerFile {
	source?: string;
	mutants: Mutant[];
}

export interface StrykerReport {
	files: Record<string, StrykerFile>;
}

export interface FileSurvivors {
	file: string;
	survived: number;
	noCoverage: number;
	timeout: number;
	total: number;
	/** Only the mutants counted above, in report order. */
	mutants: Mutant[];
}

/** Everything the strict verdict counts as debt, not only `Survived`. */
export function isDebtStatus(status: string): boolean {
	return status === 'Survived' || status === 'NoCoverage' || status === 'Timeout';
}

/** Files with at least one undead mutant, worst file first. */
export function rankFilesBySurvivors(report: StrykerReport | null): FileSurvivors[] {
	if (report === null) return [];
	const rows: FileSurvivors[] = [];
	for (const [file, entry] of Object.entries(report.files)) {
		const mutants = entry.mutants.filter((mutant) => isDebtStatus(mutant.status));
		if (mutants.length === 0) continue;
		rows.push({
			file,
			survived: mutants.filter((mutant) => mutant.status === 'Survived').length,
			noCoverage: mutants.filter((mutant) => mutant.status === 'NoCoverage').length,
			timeout: mutants.filter((mutant) => mutant.status === 'Timeout').length,
			total: mutants.length,
			mutants
		});
	}
	return rows.sort(
		(left, right) => right.total - left.total || left.file.localeCompare(right.file)
	);
}

/** A single line of source at a 1-based line number, or '' past the end. */
function sourceLine(source: string, line: number): string {
	return source.split('\n')[line - 1] ?? '';
}

/**
 * A one-line "original → mutated" snippet for one mutant.
 *
 * Stryker's `mutation.json` keeps the whole file as `source` and a mutant's
 * location as line/column, not an offset into it, so the original text has to
 * be sliced back out of the source line. A multi-line mutant (a `BlockStatement`
 * replacement, say) has no single original line to slice, so the whole start
 * line stands in for it — still one line, still recognizable.
 */
export function mutantSnippet(source: string | undefined, mutant: Mutant): string {
	if (source === undefined) return mutant.replacement;
	const { start, end } = mutant.location;
	const line = sourceLine(source, start.line);
	const original =
		end !== undefined && end.line === start.line ? line.slice(start.column, end.column) : line;
	const trimmed = original.trim() || line.trim();
	return `${trimmed} → ${mutant.replacement}`;
}

/** `MutatorName line N: original → mutated`, the form an agent can act on. */
export function describeMutant(source: string | undefined, mutant: Mutant): string {
	return `${mutant.mutatorName} line ${String(mutant.location.start.line)}: ${mutantSnippet(source, mutant)}`;
}
