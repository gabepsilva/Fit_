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
 * Mutation runs are jsdom-only, so a client file Stryker mutates must be
 * reachable from a `DOM_FREE_CLIENT_SPECS` spec; otherwise it reports NoCoverage
 * and the drift stays silent. Browser-bound files are excluded from `mutate`
 * in `stryker.config.mjs` instead.
 */

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Every lane hands Stryker an explicit file list, so this asks which files a
 * lane would mutate — production TypeScript no `!` pattern excludes — not what
 * the unscoped glob selects, which would miss a mutated-but-unmeasured route.
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
