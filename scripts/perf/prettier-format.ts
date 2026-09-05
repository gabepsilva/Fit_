import * as prettier from 'prettier';

/**
 * Formats `content` the way `format:check` expects the file at `filepath` to
 * read, using this repo's own `prettier.config.js` (`useTabs`, `printWidth`,
 * …) rather than prettier's defaults.
 *
 * Both writers of a committed perf file (`measure.ts` writing
 * `quality/perf-baseline.json`/`perf-plans.md`) and `check-plans.ts`, which
 * diffs a fresh run against them, go through this so a plain textual
 * comparison is never fooled by a formatting difference neither side
 * intended.
 */
export async function formatCommitted(content: string, filepath: string): Promise<string> {
	const config = (await prettier.resolveConfig(filepath)) ?? {};
	return prettier.format(content, { ...config, filepath });
}
