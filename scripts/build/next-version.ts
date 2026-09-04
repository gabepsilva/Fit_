import process from 'node:process';

/**
 * Which tag a merge to `main` should get, decided away from the workflow that
 * pushes it.
 *
 * The decision used to be inline bash in `version-tag.yml`, where nothing could
 * run it: no tag existed yet, so the first merge to exercise the arithmetic
 * would also have been the first merge to be wrong. Ordering is the part that
 * pays for the move — `v0.0.10` is older than `v0.0.9` to anything comparing
 * strings — and it is decided here on parsed numbers rather than trusted to a
 * sort flag on the far side of a shell.
 *
 * The workflow keeps the plumbing: ask git for the tags, ask GitHub for the
 * labels, create the ref. This holds the judgement between the two.
 */

/** The label that moves the middle number instead of the last one. */
export const MINOR_LABEL = 'release:minor';

const TAG = /^v(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/;

interface Version {
	major: number;
	minor: number;
	patch: number;
}

/** Where counting starts when no tag exists yet, so the first merge is `v0.0.1`. */
const NOTHING_RELEASED: Version = { major: 0, minor: 0, patch: 0 };

function parse(tag: string): Version | null {
	const groups = TAG.exec(tag.trim())?.groups;
	if (groups === undefined) return null;
	return {
		major: Number(groups.major),
		minor: Number(groups.minor),
		patch: Number(groups.patch)
	};
}

/** Numerically, field by field: string order puts `v0.0.10` before `v0.0.9`. */
function isNewer(candidate: Version, newest: Version): boolean {
	if (candidate.major !== newest.major) return candidate.major > newest.major;
	if (candidate.minor !== newest.minor) return candidate.minor > newest.minor;
	return candidate.patch > newest.patch;
}

export interface BumpInputs {
	/** Every tag in the repository, in any order. Anything that is not `vX.Y.Z` is ignored. */
	tags: readonly string[];
	/** The tags already on the commit being considered. */
	headTags: readonly string[];
	/** The labels on the pull request this commit came from. */
	labels: readonly string[];
}

/**
 * The next tag, or `null` when this commit already carries one — which is what
 * makes a re-run of the workflow produce no second version for one merge.
 */
export function nextVersion({ tags, headTags, labels }: BumpInputs): string | null {
	if (headTags.some((tag) => parse(tag) !== null)) return null;
	const newest = tags
		.map(parse)
		.filter((version): version is Version => version !== null)
		.reduce(
			(newest, candidate) => (isNewer(candidate, newest) ? candidate : newest),
			NOTHING_RELEASED
		);
	return labels.includes(MINOR_LABEL)
		? `v${newest.major}.${newest.minor + 1}.0`
		: `v${newest.major}.${newest.minor}.${newest.patch + 1}`;
}

/** One value per line, as `git tag` and `gh api --jq` both print them. */
export function lines(value: string | undefined): string[] {
	return (value ?? '')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '');
}

// Called by `.github/workflows/version-tag.yml`, which passes the three lists in
// the environment rather than on a command line it would have to quote. Prints
// the tag to create, or nothing at all when there is none.
if (import.meta.main) {
	const next = nextVersion({
		tags: lines(process.env['FIT_TAGS']),
		headTags: lines(process.env['FIT_HEAD_TAGS']),
		labels: lines(process.env['FIT_LABELS'])
	});
	if (next !== null) console.log(next);
}
