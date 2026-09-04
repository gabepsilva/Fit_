import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * The version string a build carries, derived from the git tag rather than
 * stored anywhere.
 *
 * `main` is protected and only receives squash merges made on GitHub, so
 * nothing runs on a developer machine at merge time and a bumped
 * `package.json` committed back would need a branch-protection bypass, a
 * second commit per merge, and a race between two merges. A tag needs none of
 * that: `.github/workflows/version-tag.yml` puts one on every merge, and this
 * reads it. `package.json` stays at `0.0.1` and is not the source of truth.
 *
 * The `+<short sha>` suffix is what makes a stale shell diagnosable from a
 * screenshot: a build that is not exactly on its tag says which commit it is,
 * and a build with no git at all — an unpacked tarball — says `+unknown`
 * rather than claiming to be the release its `package.json` names.
 */

/** What a build says for its commit when there is no git to ask. */
export const UNKNOWN_COMMIT = 'unknown';

export interface VersionInputs {
	/** The newest reachable `v*` tag, or `null` when git knows of none. */
	tag: string | null;
	/** Whether `HEAD` is exactly that tag rather than ahead of it. */
	tagged: boolean;
	/** `HEAD`'s short commit, or `null` when there is no git to ask. */
	commit: string | null;
	/** `package.json`'s version, the last resort and never the source of truth. */
	packageVersion: string;
}

export interface BuildVersion {
	/** `v0.0.7` on a tagged build, `v0.0.7+be031ca` on anything else. */
	version: string;
	/** The commit the build was made from, or `unknown`. */
	commit: string;
}

/**
 * A tagged `HEAD` is its tag; anything else is the nearest tag plus the commit
 * that distinguishes it. `tagged` is only believed when there is a tag to be
 * exactly on, so a caller that mixes the two cannot make an untagged build
 * claim a release number.
 */
export function deriveAppVersion({ tag, tagged, commit, packageVersion }: VersionInputs): string {
	const base = tag ?? `v${packageVersion}`;
	if (tag !== null && tagged) return base;
	return `${base}+${commit ?? UNKNOWN_COMMIT}`;
}

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Git's answer, or `null` when it has none — no repository, no tags, no git. */
function git(args: string[]): string | null {
	try {
		const output = execFileSync('git', args, {
			cwd: projectRoot,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
		return output === '' ? null : output;
	} catch {
		return null;
	}
}

function packageVersion(): string {
	const manifest = readFileSync(path.join(projectRoot, 'package.json'), 'utf8');
	return (JSON.parse(manifest) as { version?: string }).version ?? '0.0.0';
}

/** What this checkout would build right now. Read by `vite.config.ts` and by the deploy. */
export function readBuildVersion(): BuildVersion {
	const commit = git(['rev-parse', '--short', 'HEAD']);
	const tag = git(['describe', '--tags', '--abbrev=0', '--match', 'v*']);
	const exact = git(['describe', '--tags', '--exact-match', '--match', 'v*']);
	return {
		version: deriveAppVersion({
			tag,
			tagged: exact !== null && exact === tag,
			commit,
			packageVersion: packageVersion()
		}),
		commit: commit ?? UNKNOWN_COMMIT
	};
}
