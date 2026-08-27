import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { containerImages, semgrepRules } from './config';
import {
	assertDocker,
	cacheRoot,
	ensureDirectory,
	hostUser,
	projectRoot,
	resetReportDirectory,
	run
} from './shared';

const ruleDirectory = path.join(cacheRoot, 'semgrep');
const rulePath = path.join(ruleDirectory, 'typescript.json');

function digest(content: Uint8Array): string {
	return createHash('sha256').update(content).digest('hex');
}

async function ensureLockedRules(): Promise<void> {
	await ensureDirectory(ruleDirectory);

	try {
		const cachedRules = await readFile(rulePath);
		if (digest(cachedRules) === semgrepRules.sha256) return;
	} catch {
		// A missing cache is populated below.
	}

	const response = await fetch(semgrepRules.url);
	if (!response.ok) {
		throw new Error(`Could not download Semgrep rules: HTTP ${response.status}.`);
	}

	const rules = new Uint8Array(await response.arrayBuffer());
	const actualDigest = digest(rules);
	if (actualDigest !== semgrepRules.sha256) {
		throw new Error(
			`Semgrep rule pack changed: expected ${semgrepRules.sha256}, received ${actualDigest}. Review and deliberately update the lock.`
		);
	}

	const temporaryPath = `${rulePath}.tmp`;
	await writeFile(temporaryPath, rules);
	await rename(temporaryPath, rulePath);
}

await assertDocker();
await ensureLockedRules();
const reportDirectory = await resetReportDirectory('semgrep');

await run('docker', [
	'run',
	'--rm',
	'--read-only',
	'--network=none',
	'--cap-drop=ALL',
	'--security-opt=no-new-privileges',
	'--user',
	hostUser(),
	'--tmpfs',
	'/tmp:rw,noexec,nosuid,size=256m',
	'--env',
	'HOME=/tmp',
	'--env',
	'XDG_CACHE_HOME=/tmp',
	'--volume',
	`${projectRoot}:/src:ro`,
	'--volume',
	`${reportDirectory}:/reports:rw`,
	containerImages.semgrep,
	'semgrep',
	'scan',
	'--config=/src/.security-cache/semgrep/typescript.json',
	'--config=/src/security/semgrep.yml',
	'--metrics=off',
	'--disable-version-check',
	'--error',
	'--json-output=/reports/semgrep.json',
	'--exclude=node_modules',
	'--exclude=.svelte-kit',
	'--exclude=coverage',
	'--exclude=reports',
	'/src/src',
	'/src/scripts'
]);

console.log(
	`Semgrep report: ${path.relative(projectRoot, path.join(reportDirectory, 'semgrep.json'))}`
);
