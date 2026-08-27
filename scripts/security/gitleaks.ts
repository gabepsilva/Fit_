import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { containerImages } from './config';
import { assertDocker, capture, hostUser, projectRoot, resetReportDirectory, run } from './shared';

const reportDirectory = await resetReportDirectory('gitleaks');

async function scan(mode: 'dir' | 'git', reportName: string): Promise<void> {
	await run('docker', [
		'run',
		'--rm',
		'--read-only',
		'--network=none',
		'--cap-drop=ALL',
		'--security-opt=no-new-privileges',
		'--user',
		hostUser(),
		'--volume',
		`${projectRoot}:/workspace:ro`,
		'--volume',
		`${reportDirectory}:/reports:rw`,
		'--workdir=/workspace',
		containerImages.gitleaks,
		mode,
		'--config=/workspace/.gitleaks.toml',
		'--redact=100',
		'--no-banner',
		'--no-color',
		'--report-format=json',
		`--report-path=/reports/${reportName}`,
		'/workspace'
	]);

	const reportPath = path.join(reportDirectory, reportName);
	try {
		await readFile(reportPath);
	} catch {
		await writeFile(reportPath, '[]\n');
	}
}

async function hasGitHistory(): Promise<boolean> {
	try {
		await capture('git', ['rev-parse', '--verify', 'HEAD']);
		return true;
	} catch {
		return false;
	}
}

await assertDocker();
await scan('dir', 'working-tree.json');

if (await hasGitHistory()) {
	await scan('git', 'git-history.json');
} else {
	await writeFile(path.join(reportDirectory, 'git-history.json'), '[]\n');
	console.log('Gitleaks history scan skipped because the repository has no commits yet.');
}

console.log(`Gitleaks reports: ${path.relative(projectRoot, reportDirectory)}`);
