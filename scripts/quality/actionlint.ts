import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { containerImages } from '../security/config';
import { assertDocker, captureStatus, hostUser, projectRoot } from '../security/shared';

interface ActionlintError {
	message: string;
	filepath: string;
	line: number;
	column: number;
	kind: string;
}

const reportPath = path.join(projectRoot, 'reports', 'quality', 'actionlint.json');
await mkdir(path.dirname(reportPath), { recursive: true });
await assertDocker();

// Actionlint accepts one output format per run, so emit JSON and render it here.
const { exitCode, output, stdout } = await captureStatus('docker', [
	'run',
	'--rm',
	'--read-only',
	'--network=none',
	'--cap-drop=ALL',
	'--security-opt=no-new-privileges',
	'--user',
	hostUser(),
	'--volume',
	`${projectRoot}:/repo:ro`,
	'--workdir=/repo',
	containerImages.actionlint,
	'-color=false',
	'-format',
	'{{json .}}'
]);

let errors: ActionlintError[];
try {
	errors = JSON.parse(stdout.trim() === '' ? '[]' : stdout) as ActionlintError[];
	await writeFile(reportPath, `${JSON.stringify(errors, null, 2)}\n`);
} catch {
	console.error(output.trimEnd());
	throw new Error(`Actionlint exited with code ${exitCode} without parsable output.`);
}

for (const error of errors) {
	console.error(`${error.filepath}:${error.line}:${error.column}  ${error.kind}  ${error.message}`);
}
console.log(
	`Actionlint: ${errors.length} findings. Report: ${path.relative(projectRoot, reportPath)}`
);

if (exitCode !== 0) process.exitCode = exitCode;
