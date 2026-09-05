import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * The gate self-test's `mutation` group proves Stryker itself still kills a
 * planted mutant; it never touches the app. Only these paths can change what
 * it measures, so a pull request that does not touch them cannot break it and
 * does not need to pay its ~300s cost (product owner, 2026-09-05 — the group
 * still runs daily regardless, see `mutation-audit.yml`).
 */
const MUTATION_SELF_TEST_GLOBS: readonly RegExp[] = [
	/^scripts\/quality\//,
	/^quality\//,
	/^stryker[^/]*\.config\.[^/]*$/,
	/^\.github\/workflows\//,
	/^package\.json$/,
	/^bun\.lock$/,
	/^\.tool-versions$/
];

/** Exported for the spec: pure, no git, no filesystem. */
export function mutationSelfTestCanBreak(changedPaths: readonly string[]): boolean {
	return changedPaths.some((changedPath) =>
		MUTATION_SELF_TEST_GLOBS.some((glob) => glob.test(changedPath))
	);
}

function resolveBase(): string {
	const requested = process.env['SELF_TEST_SCOPE_BASE'];
	if (requested !== undefined && requested.length > 0) return requested;
	const baseRef = process.env['GITHUB_BASE_REF'];
	if (baseRef !== undefined && baseRef.length > 0) return `origin/${baseRef}`;
	return 'HEAD^';
}

function changedPaths(base: string): string[] {
	return execFileSync('git', ['diff', '--name-only', base], {
		cwd: projectRoot,
		encoding: 'utf8'
	})
		.split('\n')
		.filter((entry) => entry.length > 0);
}

if (import.meta.main) {
	const base = resolveBase();
	const needed = mutationSelfTestCanBreak(changedPaths(base));
	console.log(
		`Mutation self-test scope: diffed against ${base}; the mutation group is ${needed ? 'needed' : 'not needed'}.`
	);
	const githubOutput = process.env['GITHUB_OUTPUT'];
	if (githubOutput !== undefined && githubOutput.length > 0) {
		await appendFile(githubOutput, `needed=${needed}\n`);
	}
}
