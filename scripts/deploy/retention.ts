import { shellQuote } from './config';

/**
 * What a deploy keeps of the releases it replaces.
 *
 * Pruning used to take an old release out whole the moment it fell out of the
 * window, and a browser holding a stale HTML shell asks for the hashed chunks
 * that shell was built against. Those live under `_app/immutable` in the
 * release that produced them, so once it was removed the requests answered
 * 404 and the app came up blank rather than slow — which is how a phone that
 * had not reloaded in a day lost the site to a deploy it had nothing to do
 * with.
 *
 * Serving them again is not a matter of leaving the old directory on disk:
 * adapter-node serves static files out of the release it is running, so
 * anything the live release cannot see does not exist as far as a request is
 * concerned. The assets are therefore carried forward into each new release —
 * as hard links, so the bytes are stored once — and the old release is then
 * free to be pruned like anything else.
 */

/**
 * How many earlier releases' assets a new release also serves.
 *
 * A release's `_app/immutable` is 1.4 MB, the machine has 8.9 GB free, and the
 * carried-forward copies are hard links to bytes the older release already
 * holds — so five generations of them cost single-digit megabytes even once
 * every release they came from has been pruned. What the number buys is time:
 * a device that has not reloaded since five deploys ago still gets its chunks.
 * Beyond that the shell it is holding is old enough that the `no-cache` on it
 * is the honest answer, and keeping every asset ever built would be the
 * unbounded growth this file exists to avoid.
 */
export const ASSET_GENERATIONS = 5;

/** Where a SvelteKit build puts the hashed files a shell asks for by name. */
export const IMMUTABLE_ASSETS = 'build/client/_app/immutable';

/**
 * A release's own assets, kept apart from the ones it inherited.
 *
 * Without it "the previous release's assets" would mean "everything the
 * previous release had inherited too", and each deploy would carry the whole
 * history of the app forward one more time. This is the pristine copy — hard
 * links again, so it costs a directory entry — and it is what the generations
 * below are counted in.
 */
export const RELEASE_ASSETS = '.assets';

/**
 * When a release was deployed, written by the deploy that did it.
 *
 * Age used to be read from the directory's own mtime, which is wrong the
 * moment anything writes into the directory — and pruning does exactly that:
 * stripping a release of everything but its assets stamps the parent with the
 * time of the prune, so the oldest releases on the machine looked like the
 * newest. `ls -t` then handed out an order that had nothing to do with when
 * anything was released. Over thirty simulated deploys the effect was a
 * permanent hole three releases back in the window and a rollback depth of
 * three where five was promised.
 *
 * So the order is recorded rather than inferred, and pruning preserves this
 * file for the same reason it preserves the assets.
 */
export const RELEASE_STAMP = '.deployed-at';

/**
 * Hard-link every file under one directory into another, never overwriting.
 *
 * Hashed names make a collision a file that is already the same file, so the
 * first release to have shipped an asset keeps ownership of it and a re-link
 * is skipped rather than raced. `cp` is the fallback for the one case `ln`
 * cannot serve — a release that ended up on another filesystem — because a
 * slow copy of 1.4 MB is better than a deploy that fails over asset retention.
 */
const LINK_TREE = `link_tree() {
	from=$1
	to=$2
	[ -d "$from" ] || return 0
	mkdir -p "$to"
	( cd "$from" && find . -type f -print ) | while IFS= read -r file; do
		mkdir -p "$to/$(dirname "$file")"
		[ -e "$to/$file" ] || ln "$from/$file" "$to/$file" 2>/dev/null || cp -p "$from/$file" "$to/$file"
	done
}`;

/**
 * Every release under the current directory, newest first.
 *
 * Nanoseconds since the epoch, zero-padded to a fixed width by construction,
 * so a plain lexical sort is the numeric one and no shell has to do
 * arithmetic on a nineteen-digit number. A release from before this file
 * existed has its stamp backfilled once, from the mtime it still has because
 * nothing has stripped it yet.
 */
const RELEASE_ORDER = `release_order() {
	for directory in */; do
		directory=\${directory%/}
		[ -d "$directory" ] || continue
		[ -f "$directory/${RELEASE_STAMP}" ] ||
			printf '%s000000000\\n' "$(stat -c %Y "$directory")" > "$directory/${RELEASE_STAMP}"
		printf '%s %s\\n' "$(cat "$directory/${RELEASE_STAMP}")" "$directory"
	done | sort -r | cut -d' ' -f2
}`;

export type Retention = {
	/** The release directory being deployed. */
	target: string;
	releasesRoot: string;
	/** How many earlier releases' assets the new release also serves. */
	generations: number;
};

/**
 * The new release's own assets, recorded, and the assets of the releases
 * behind it, linked in beside them.
 *
 * The snapshot is taken first and from the build alone, so a generation is a
 * release's own output rather than everything it had inherited — otherwise
 * each deploy would carry the whole history forward one release further and
 * the bound below would not be one.
 *
 * The releases it reaches back through include the live one, because this
 * runs before the symlink moves and the release still serving requests is the
 * one a stale shell is most likely to be a generation behind. A release that
 * predates this retention has no `.assets` of its own; its `_app/immutable`
 * has inherited nothing, so it is the pristine copy and is used as one.
 */
export function retainAssetsScript(retention: Retention): string {
	return `${LINK_TREE}

${RELEASE_ORDER}

target=${shellQuote(retention.target)}
cd ${shellQuote(retention.releasesRoot)}
# %N is not universal; without it a whole second is the resolution, which is
# still finer than the gap between two deploys of the same machine.
stamp=$(date -u +%s%N)
if [ -z "$stamp" ] || [ -n "\${stamp//[0-9]/}" ]; then stamp="$(date -u +%s)000000000"; fi
printf '%s\\n' "$stamp" > "$target/${RELEASE_STAMP}"
rm -rf "$target/${RELEASE_ASSETS}"
link_tree "$target/${IMMUTABLE_ASSETS}" "$target/${RELEASE_ASSETS}"
for release in $(release_order | grep -vx "$(basename "$target")" | head -n ${retention.generations} || true); do
	assets="$release/${RELEASE_ASSETS}"
	[ -d "$assets" ] || assets="$release/${IMMUTABLE_ASSETS}"
	link_tree "$assets" "$target/${IMMUTABLE_ASSETS}"
done
`;
}

export type Prune = {
	releasesRoot: string;
	currentLink: string;
	/** Releases kept whole, the live one included, so a rollback has somewhere to go. */
	kept: number;
	/** Releases kept for their assets alone, once they have fallen out of `kept`. */
	generations: number;
};

/**
 * Everything older than the releases worth keeping, and never the live one.
 *
 * Three tiers rather than two: the newest are kept whole so a rollback has
 * somewhere to go, the next `generations` are stripped to the assets a future
 * release will carry forward — a directory of hard links, so stripping one
 * frees the release's 150 MB and keeps its 1.4 MB — and everything behind
 * those is removed. The last tier is the point: retention that never ended
 * would be an accumulation with a friendlier name.
 */
export function pruneReleasesScript(prune: Prune): string {
	return `${LINK_TREE}

${RELEASE_ORDER}

cd ${shellQuote(prune.releasesRoot)}
live=$(basename "$(readlink -f ${shellQuote(prune.currentLink)})")
others=$(release_order | grep -vx "$live" || true)
for directory in $(echo "$others" | tail -n +${prune.kept} | head -n ${prune.generations}); do
	[ -d "$directory/${RELEASE_ASSETS}" ] ||
		link_tree "$directory/${IMMUTABLE_ASSETS}" "$directory/${RELEASE_ASSETS}"
	find "$directory" -mindepth 1 -maxdepth 1 ! -name ${shellQuote(RELEASE_ASSETS)} ! -name ${shellQuote(RELEASE_STAMP)} -exec rm -rf -- {} +
done
for directory in $(echo "$others" | tail -n +${prune.kept + prune.generations}); do
	rm -rf -- "$directory"
done
`;
}
