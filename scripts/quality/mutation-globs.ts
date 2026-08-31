import { MUTATE_PATTERNS } from '../../quality/mutate-patterns.mjs';

/**
 * `quality/mutate-patterns.mjs` is what Stryker is handed for a full run, and
 * the changed lanes have to select the same files before they can narrow to the
 * changed ones. That means matching the patterns here rather than restating
 * them, so a file excluded for the full lane cannot reappear in a changed one.
 *
 * The patterns use `**`, `*` and `{a,b}` and nothing else. A general glob engine
 * would be a dependency and a second dialect to keep in step with Stryker's;
 * anything outside that subset fails loudly rather than matching something
 * unintended.
 */
function patternToRegExp(pattern: string): RegExp {
	let source = '^';
	for (let index = 0; index < pattern.length; index += 1) {
		const character = pattern[index] ?? '';
		if (character === '*') {
			if (pattern[index + 1] === '*') {
				// `**/` spans directories, including none at all.
				const spansDirectories = pattern[index + 2] === '/';
				source += spansDirectories ? '(?:.*/)?' : '.*';
				index += spansDirectories ? 2 : 1;
			} else {
				source += '[^/]*';
			}
		} else if (character === '{') {
			const close = pattern.indexOf('}', index);
			if (close === -1) throw new Error(`Unbalanced brace in mutate pattern: ${pattern}`);
			const alternatives = pattern.slice(index + 1, close).split(',');
			if (alternatives.some((alternative) => /[*{}/]/.test(alternative)))
				throw new Error(`Unsupported brace content in mutate pattern: ${pattern}`);
			source += `(?:${alternatives.map(escape).join('|')})`;
			index = close;
		} else if ('?[]()'.includes(character)) {
			throw new Error(`Unsupported character "${character}" in mutate pattern: ${pattern}`);
		} else {
			source += escape(character);
		}
	}
	return new RegExp(`${source}$`);
}

function escape(literal: string): string {
	return literal.replace(/[.+^$()|[\]\\]/g, '\\$&');
}

const excludes = MUTATE_PATTERNS.filter((pattern) => pattern.startsWith('!')).map((pattern) =>
	patternToRegExp(pattern.slice(1))
);

/**
 * Whether a repository-relative path is excluded from mutation.
 *
 * Only the exclusions are asked about outside the full lane, and deliberately.
 * Every lane hands Stryker an explicit file list, which replaces the include
 * globs outright — so those describe the default and the `!` entries are the
 * half that has to hold everywhere. Applying the includes to a changed lane
 * would silently narrow it to `src/lib`, dropping the routes and hooks it
 * mutates today.
 */
export function isExcludedFromMutation(file: string): boolean {
	return excludes.some((pattern) => pattern.test(file));
}
