import { MUTATE_PATTERNS } from '../../quality/mutate-patterns.mjs';

/**
 * Patterns are matched here rather than restated, so a file excluded for the
 * full lane cannot reappear in a changed one. Only `**`, `*` and `{a,b}` are
 * supported; anything outside that subset fails loudly, not matches loosely.
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
 * Whether a repository-relative path is excluded from mutation. Only the `!`
 * exclusions hold everywhere: every lane hands Stryker an explicit file list,
 * so the include globs describe only the default lane; applying them to a
 * changed lane would silently narrow it to `src/lib`.
 */
export function isExcludedFromMutation(file: string): boolean {
	return excludes.some((pattern) => pattern.test(file));
}
