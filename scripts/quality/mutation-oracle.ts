import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { DOM_FREE_CLIENT_SPECS } from '../../quality/dom-free-client-specs.mjs';
import { isExcludedFromMutation } from './mutation-globs';
import {
	expandRuntimeImports,
	isProductionTypeScript,
	isServerSource,
	walk
} from './mutation-scope';

/**
 * The browser project is not part of a mutation run: mutation testing needs
 * thousands of cheap isolated runs and Chromium gives expensive stateful ones,
 * so `vite.config.ts` hands the client lane to the jsdom project alone.
 *
 * That makes `DOM_FREE_CLIENT_SPECS` load-bearing in a way a list of file names
 * does not look. A client module reachable only from a component spec is no
 * longer measured by anything, and it does not fail loudly — it is reported as
 * NoCoverage, which reads as "no tests yet" rather than "the gate cannot see
 * this". The two lists drift silently and the score stays green.
 *
 * So this check closes the loop: every client file Stryker is told to mutate
 * must be reachable from a spec the jsdom project runs. A file that genuinely
 * belongs to the browser is excluded from `mutate` in `stryker.config.mjs`,
 * next to the seed-data exclusions, where the reason is written down and
 * reviewed rather than inferred from a silent zero.
 */

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Every lane hands Stryker an explicit file list rather than the glob, so the
 * question this check has to ask is which client files a *lane* would mutate —
 * production TypeScript that no `!` pattern excludes — not which files the
 * unscoped glob selects. Asking the narrower question would let a route or a
 * hook be mutated while nothing measured it.
 */
async function mutatedClientFiles(): Promise<string[]> {
	const all = (await walk(path.join(projectRoot, 'src'))).map((file) =>
		path.relative(projectRoot, file).split(path.sep).join('/')
	);
	return all
		.filter(isProductionTypeScript)
		.filter((file) => !isServerSource(file))
		.filter((file) => !isExcludedFromMutation(file))
		.sort();
}

const failures: string[] = [];

// A renamed spec would drop out of the jsdom project's `include` and fall back
// into the browser one, taking whatever it covers out of the oracle with it.
for (const spec of DOM_FREE_CLIENT_SPECS) {
	try {
		await access(path.join(projectRoot, spec));
	} catch {
		failures.push(`DOM_FREE_CLIENT_SPECS lists a spec that does not exist: ${spec}`);
	}
}

const mutated = await mutatedClientFiles();
const reachable = new Set(await expandRuntimeImports(projectRoot, DOM_FREE_CLIENT_SPECS));
for (const file of mutated) {
	if (!reachable.has(file)) {
		failures.push(
			`${file} is mutated but no spec in DOM_FREE_CLIENT_SPECS reaches it, so the mutation gate cannot measure it.`
		);
	}
}

if (failures.length === 0) {
	console.log(
		`Mutation oracle: ${mutated.length} mutated client file(s), all reachable from ${DOM_FREE_CLIENT_SPECS.length} DOM-free spec(s).`
	);
} else {
	for (const failure of failures) console.error(failure);
	console.error(
		'\nGive the file a spec the jsdom project runs, or exclude it from `mutate` in stryker.config.mjs with the reason written down.'
	);
	process.exitCode = 1;
}
