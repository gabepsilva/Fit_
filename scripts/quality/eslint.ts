import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { captureStatus } from '../security/shared';

interface LintMessage {
	ruleId: string | null;
	severity: number;
	message: string;
	line: number;
	column: number;
}

interface LintResult {
	filePath: string;
	messages: LintMessage[];
	errorCount: number;
	warningCount: number;
}

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const reportPath = path.join(projectRoot, 'reports', 'quality', 'eslint.json');
await mkdir(path.dirname(reportPath), { recursive: true });

// ESLint accepts one formatter per run. Emit the machine-readable one and
// render it for humans here, so a single run serves both audiences.
//
// Type-aware linting is the slowest static gate because every worker builds its
// own TypeScript program. `auto` spends that cost only where it pays: ESLint
// runs ceil(files / 50) workers, capped at half the host's cores, so a developer
// box parallelises and a 4-vCPU CI runner stays at two. A hardcoded thread count
// would be tuned for one of those and wrong on the other. Measured here at 218
// files: off 98.5s/1.4GB, auto 18.7s/4.9GB, 8 threads 15.6s/7.1GB, 28 threads
// 28.8s/18.0GB -- past the turnover, extra workers cost more than they save.
// Findings are identical across all four; concurrency changes timing, not the verdict.
const { exitCode } = await captureStatus(
	path.join(projectRoot, 'node_modules', '.bin', 'eslint'),
	[
		'.',
		'--max-warnings',
		'0',
		'--concurrency',
		'auto',
		'--format',
		'json',
		'--output-file',
		reportPath
	],
	{ stream: true }
);

let results: LintResult[];
try {
	results = JSON.parse(await readFile(reportPath, 'utf8')) as LintResult[];
} catch {
	// A configuration error (exit 2) leaves no parsable report behind.
	process.exitCode = exitCode === 0 ? 1 : exitCode;
	throw new Error(`ESLint exited with code ${exitCode} without writing a report.`);
}

const problems = results.filter((result) => result.errorCount + result.warningCount > 0);
for (const result of problems) {
	console.log(path.relative(projectRoot, result.filePath));
	for (const message of result.messages) {
		const level = message.severity === 2 ? 'error' : 'warning';
		console.log(
			`  ${message.line}:${message.column}  ${level}  ${message.message}  ${message.ruleId ?? ''}`
		);
	}
}

const errors = results.reduce((total, result) => total + result.errorCount, 0);
const warnings = results.reduce((total, result) => total + result.warningCount, 0);
console.log(
	`ESLint: ${errors} errors, ${warnings} warnings across ${results.length} files. Report: ${path.relative(projectRoot, reportPath)}`
);

if (exitCode !== 0) process.exitCode = exitCode;
