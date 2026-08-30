import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import type {
	LineRange,
	MutationLane,
	MutationLimits,
	MutationPolicy,
	MutationReviewLedger,
	ReviewedMutant,
	MutationScope
} from './mutation-types';
import { parseMutationPolicy, policyName } from './mutation-types';

interface Position {
	line: number;
	column: number;
}

interface Mutant {
	id: string;
	status: string;
	mutatorName: string;
	replacement: string;
	location: { start: Position; end: Position };
}

interface MutationReport {
	files: Record<string, { source: string; mutants: Mutant[] }>;
}

interface Counts {
	total: number;
	killed: number;
	survived: number;
	timeout: number;
	noCoverage: number;
	errors: number;
}

interface FileVerdict extends Counts {
	file: string;
	killedScore: number;
	observableChangedTotal: number;
	observableChangedKilled: number;
	reviewedChangedSurvivors: number;
	observableChangedKilledScore: number | null;
}

export interface MutationVerdict extends Counts {
	ok: boolean;
	lane: MutationLane;
	policy: keyof Omit<MutationPolicy, 'version'>;
	verdictMode: 'strict' | 'strict-changed-with-legacy-background' | 'legacy-full';
	killedScore: number;
	/** Stryker-compatible score retained only for the legacy full-tree audit. */
	mutationScore: number;
	strictFiles: number;
	strictKilled: number;
	strictTotal: number;
	strictKilledScore: number;
	strictTimeout: number;
	strictNoCoverage: number;
	strictErrors: number;
	backgroundMutationScore: number | null;
	files: FileVerdict[];
	reviewedSurvivors: number;
	failures: string[];
}

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const REVIEWED_MUTANT_KEYS = [
	'classification',
	'file',
	'fingerprint',
	'location',
	'mutatorName',
	'rationale',
	'replacement',
	'review',
	'sourceHash'
].sort();

function isPosition(value: unknown): value is Position {
	return (
		isRecord(value) &&
		Number.isInteger(value.line) &&
		Number(value.line) >= 1 &&
		Number.isInteger(value.column) &&
		Number(value.column) >= 0
	);
}

function isReviewedMutant(value: unknown): value is ReviewedMutant {
	if (!isRecord(value)) return false;
	const normalized = typeof value.file === 'string' ? path.posix.normalize(value.file) : '';
	return (
		JSON.stringify(Object.keys(value).sort()) === JSON.stringify(REVIEWED_MUTANT_KEYS) &&
		typeof value.fingerprint === 'string' &&
		typeof value.file === 'string' &&
		typeof value.mutatorName === 'string' &&
		typeof value.replacement === 'string' &&
		isRecord(value.location) &&
		isPosition(value.location.start) &&
		isPosition(value.location.end) &&
		typeof value.sourceHash === 'string' &&
		(value.classification === 'equivalent' ||
			value.classification === 'host-specific-defense-in-depth') &&
		typeof value.rationale === 'string' &&
		typeof value.review === 'string' &&
		!/[*?[\]]/.test(value.file) &&
		!path.posix.isAbsolute(value.file) &&
		normalized === value.file &&
		!normalized.startsWith('../')
	);
}

export function mutantFingerprint(input: {
	file: string;
	mutatorName: string;
	replacement: string;
	location: Mutant['location'];
	sourceHash: string;
}): string {
	return sha256(
		JSON.stringify({
			file: input.file,
			mutatorName: input.mutatorName,
			replacement: input.replacement,
			location: input.location,
			sourceHash: input.sourceHash
		})
	);
}

function reviewedFingerprints(
	ledger: MutationReviewLedger,
	expected: ReadonlySet<string>,
	failures: string[]
): Map<string, string> {
	const fingerprints = new Map<string, string>();
	const seen = new Set<string>();
	if (!isRecord(ledger) || ledger.version !== 1 || !Array.isArray(ledger.entries)) {
		failures.push('reviewed-mutant ledger must have version 1 and an entries array');
		return fingerprints;
	}
	for (const candidate of ledger.entries as unknown[]) {
		if (!isReviewedMutant(candidate)) {
			failures.push('invalid reviewed-mutant entry: malformed or non-exact schema');
			continue;
		}
		const entry = candidate;
		const recomputed = mutantFingerprint(entry);
		if (
			entry.fingerprint !== recomputed ||
			!/^[a-f0-9]{64}$/.test(entry.sourceHash) ||
			entry.rationale.trim().length < 40 ||
			!/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(entry.review)
		) {
			failures.push(`invalid reviewed-mutant entry: ${entry.file} ${entry.fingerprint}`);
			continue;
		}
		if (seen.has(entry.fingerprint)) {
			failures.push(`duplicate reviewed-mutant fingerprint: ${entry.fingerprint}`);
			continue;
		}
		seen.add(entry.fingerprint);
		if (expected.has(entry.file)) fingerprints.set(entry.fingerprint, entry.file);
	}
	return fingerprints;
}

export function mutationReviewLedgerFailures(value: unknown): string[] {
	const failures: string[] = [];
	reviewedFingerprints(value as MutationReviewLedger, new Set(), failures);
	return failures;
}

function blankCounts(): Counts {
	return { total: 0, killed: 0, survived: 0, timeout: 0, noCoverage: 0, errors: 0 };
}

function addStatus(counts: Counts, status: string): void {
	counts.total += 1;
	if (status === 'Killed') counts.killed += 1;
	else if (status === 'Survived') counts.survived += 1;
	else if (status === 'Timeout') counts.timeout += 1;
	else if (status === 'NoCoverage') counts.noCoverage += 1;
	else counts.errors += 1;
}

function percent(killed: number, total: number): number {
	return total === 0 ? 100 : (killed / total) * 100;
}

function compatibleMutationScore(counts: Counts): number {
	const valid = counts.killed + counts.timeout + counts.survived + counts.noCoverage;
	return percent(counts.killed + counts.timeout, valid);
}

function intersects(location: Mutant['location'], ranges: readonly LineRange[]): boolean {
	return ranges.some(
		(range) => location.start.line <= range.end && location.end.line >= range.start
	);
}

function isDeclarationOnly(statement: ts.Statement): boolean {
	if (
		ts.isImportDeclaration(statement) ||
		ts.isExportDeclaration(statement) ||
		ts.isInterfaceDeclaration(statement) ||
		ts.isTypeAliasDeclaration(statement) ||
		ts.isEmptyStatement(statement)
	) {
		return true;
	}
	return (
		ts.canHaveModifiers(statement) &&
		ts
			.getModifiers(statement)
			?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword) === true
	);
}

function hasMutationCandidate(source: string, file: string): boolean {
	const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
	// Fail closed: omission is safe only when every top-level statement is
	// provably erased/type-only or an import/re-export Stryker cannot mutate.
	return parsed.statements.some((statement) => !isDeclarationOnly(statement));
}

async function missingExecutableFiles(
	projectRoot: string,
	scope: MutationScope,
	reported: ReadonlySet<string>
): Promise<string[]> {
	const missing: string[] = [];
	for (const { path: file } of scope.files) {
		if (reported.has(file)) continue;
		const source = await readFile(path.join(projectRoot, file), 'utf8');
		if (hasMutationCandidate(source, file)) missing.push(file);
	}
	return missing;
}

function limitsFor(policy: MutationPolicy, lane: Exclude<MutationLane, 'full'>): MutationLimits {
	return lane === 'security' ? policy.security : policy.changed;
}

export async function evaluateMutationReport(options: {
	projectRoot: string;
	lane: MutationLane;
	scope: MutationScope;
	report: MutationReport;
	policy: MutationPolicy;
	ledger?: MutationReviewLedger;
}): Promise<MutationVerdict> {
	const { projectRoot, lane, scope, report, policy } = options;
	const limits = lane === 'full' ? null : limitsFor(policy, lane);
	const failures: string[] = [];
	if (scope.version !== 2) failures.push('mutation scope must have version 2');
	for (const file of scope.files) {
		if (
			file.changeStatus !== null &&
			(typeof file.changeStatus !== 'string' || file.changeStatus.length === 0)
		) {
			failures.push(`mutation scope has invalid change status: ${file.path}`);
		}
	}
	const expected = new Set(scope.files.map(({ path: file }) => file));
	const changed = new Map(scope.files.map(({ path: file, changedLines }) => [file, changedLines]));
	const changeStatuses = new Map(
		scope.files.map(({ path: file, changeStatus }) => [file, changeStatus])
	);
	const reportEntries = Object.entries(report.files).sort(([left], [right]) =>
		left.localeCompare(right)
	);
	const actual = new Set(reportEntries.map(([file]) => file));
	const reviewed = reviewedFingerprints(
		options.ledger ?? { version: 1, entries: [] },
		expected,
		failures
	);
	const matchedReviewed = new Set<string>();
	const unexpected = [...actual].filter((file) => !expected.has(file));
	if (unexpected.length > 0)
		failures.push(`report contains files outside scope: ${unexpected.join(', ')}`);
	const missing = await missingExecutableFiles(projectRoot, scope, actual);
	if (missing.length > 0)
		failures.push(`report omitted executable scoped files: ${missing.join(', ')}`);
	if (lane === 'security' && scope.files.length === 0) failures.push('security scope is empty');

	const aggregate = blankCounts();
	const strictAggregate = blankCounts();
	const backgroundAggregate = blankCounts();
	const files: FileVerdict[] = [];
	let strictFiles = 0;
	let reviewedSurvivors = 0;
	for (const [file, fileReport] of reportEntries) {
		const counts = blankCounts();
		let observableChangedTotal = 0;
		let observableChangedKilled = 0;
		let reviewedChangedSurvivors = 0;
		let verifiedSource = fileReport.source;
		if (expected.has(file)) {
			verifiedSource = await readFile(path.join(projectRoot, file), 'utf8');
			if (verifiedSource !== fileReport.source) {
				failures.push(`report source does not match scoped file: ${file}`);
			}
		}
		const sourceHash = sha256(verifiedSource);
		for (const mutant of fileReport.mutants) {
			const fingerprint = mutantFingerprint({
				file,
				mutatorName: mutant.mutatorName,
				replacement: mutant.replacement,
				location: mutant.location,
				sourceHash
			});
			const isReviewed = mutant.status === 'Survived' && reviewed.has(fingerprint);
			if (isReviewed) {
				matchedReviewed.add(fingerprint);
				reviewedSurvivors += 1;
			}
			addStatus(counts, mutant.status);
			addStatus(aggregate, mutant.status);
			if (intersects(mutant.location, changed.get(file) ?? [])) {
				if (isReviewed) reviewedChangedSurvivors += 1;
				else {
					observableChangedTotal += 1;
					if (mutant.status === 'Killed') observableChangedKilled += 1;
				}
			}
		}
		const fileVerdict: FileVerdict = {
			file,
			...counts,
			killedScore: percent(counts.killed, counts.total),
			observableChangedTotal,
			observableChangedKilled,
			reviewedChangedSurvivors,
			observableChangedKilledScore:
				observableChangedTotal === 0
					? null
					: percent(observableChangedKilled, observableChangedTotal)
		};
		files.push(fileVerdict);
		const strictFile =
			lane === 'security' ||
			(lane !== 'full' && (scope.fallback === null || changeStatuses.get(file) !== null));
		if (strictFile) {
			strictFiles += 1;
			for (const mutant of fileReport.mutants) addStatus(strictAggregate, mutant.status);
		} else if (lane !== 'full') {
			for (const mutant of fileReport.mutants) addStatus(backgroundAggregate, mutant.status);
		}
		if (limits !== null && strictFile && fileVerdict.killedScore < limits.perFileKilled) {
			failures.push(
				`${file} killed-only score ${fileVerdict.killedScore.toFixed(2)} is below ${limits.perFileKilled}`
			);
		}
		if (
			fileVerdict.observableChangedKilledScore !== null &&
			limits !== null &&
			fileVerdict.observableChangedKilledScore < limits.changedLinesKilled
		) {
			failures.push(
				`${file} observable changed-line score ${fileVerdict.observableChangedKilledScore.toFixed(2)} is below ${limits.changedLinesKilled}`
			);
		}
	}
	for (const [fingerprint, file] of reviewed) {
		if (!matchedReviewed.has(fingerprint)) {
			failures.push(`reviewed mutant is stale or no longer survives: ${file} ${fingerprint}`);
		}
	}

	const killedScore = percent(aggregate.killed, aggregate.total);
	const mutationScore = compatibleMutationScore(aggregate);
	const strictKilledScore = percent(strictAggregate.killed, strictAggregate.total);
	const backgroundMutationScore =
		lane !== 'full' && scope.fallback !== null
			? compatibleMutationScore(backgroundAggregate)
			: null;
	if (scope.files.length > 0 && aggregate.total === 0) failures.push('scope produced no mutants');
	if (limits === null && mutationScore < policy.full.aggregateScore) {
		failures.push(
			`full-tree mutation score ${mutationScore.toFixed(2)} is below ${policy.full.aggregateScore}`
		);
	}
	if (
		lane !== 'full' &&
		scope.fallback !== null &&
		backgroundAggregate.total > 0 &&
		backgroundMutationScore !== null &&
		backgroundMutationScore < policy.full.aggregateScore
	) {
		failures.push(
			`unchanged fallback background mutation score ${backgroundMutationScore.toFixed(2)} is below ${policy.full.aggregateScore}`
		);
	}
	if (limits !== null && strictAggregate.total > 0 && strictKilledScore < limits.aggregateKilled) {
		failures.push(
			`strict changed aggregate killed-only score ${strictKilledScore.toFixed(2)} is below ${limits.aggregateKilled}`
		);
	}
	if (limits !== null && strictAggregate.timeout > limits.maxTimeouts) {
		failures.push(
			`strict changed timeouts ${strictAggregate.timeout} exceed ${limits.maxTimeouts}`
		);
	}
	if (limits !== null && strictAggregate.noCoverage > limits.maxNoCoverage) {
		failures.push(
			`strict changed uncovered mutants ${strictAggregate.noCoverage} exceed ${limits.maxNoCoverage}`
		);
	}
	if (limits !== null && strictAggregate.errors > limits.maxErrors) {
		failures.push(
			`strict changed errored mutants ${strictAggregate.errors} exceed ${limits.maxErrors}`
		);
	}

	return {
		ok: failures.length === 0,
		lane,
		policy: policyName(lane),
		verdictMode:
			lane === 'full'
				? 'legacy-full'
				: scope.fallback === null
					? 'strict'
					: 'strict-changed-with-legacy-background',
		...aggregate,
		killedScore,
		mutationScore,
		strictFiles,
		strictKilled: strictAggregate.killed,
		strictTotal: strictAggregate.total,
		strictKilledScore,
		strictTimeout: strictAggregate.timeout,
		strictNoCoverage: strictAggregate.noCoverage,
		strictErrors: strictAggregate.errors,
		backgroundMutationScore,
		files,
		reviewedSurvivors,
		failures
	};
}

export async function verifyMutationFiles(options: {
	projectRoot: string;
	lane: MutationLane;
	scopePath: string;
	reportPath: string;
	policyPath: string;
	verdictPath: string;
	ledgerPath: string;
	startedAt: number;
}): Promise<MutationVerdict> {
	const reportStats = await stat(options.reportPath);
	if (reportStats.mtimeMs < options.startedAt) throw new Error('Mutation report is stale.');
	const [scope, report, policy, ledger] = await Promise.all([
		readFile(options.scopePath, 'utf8').then((value) => JSON.parse(value) as MutationScope),
		readFile(options.reportPath, 'utf8').then((value) => JSON.parse(value) as MutationReport),
		readFile(options.policyPath, 'utf8').then((value) => parseMutationPolicy(JSON.parse(value))),
		readFile(options.ledgerPath, 'utf8').then((value) => JSON.parse(value) as MutationReviewLedger)
	]);
	if (scope.lane !== options.lane) {
		throw new Error(`Scope lane ${scope.lane} does not match requested lane ${options.lane}.`);
	}
	const verdict = await evaluateMutationReport({
		projectRoot: options.projectRoot,
		lane: options.lane,
		scope,
		report,
		policy,
		ledger
	});
	await writeFile(options.verdictPath, `${JSON.stringify(verdict, null, '\t')}\n`);
	return verdict;
}
