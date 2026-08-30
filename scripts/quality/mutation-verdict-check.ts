import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import type { MutationLane } from './mutation-types';
import { verifyMutationFiles } from './mutation-verdict';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const lane = process.argv[2];
if (!['security', 'changed-node', 'changed-client', 'full'].includes(lane ?? '')) {
	throw new Error('Usage: mutation-verdict-check.ts <lane> <scope> <report> <verdict>');
}
const [scopeArgument, reportArgument, verdictArgument] = process.argv.slice(3);
if (scopeArgument === undefined || reportArgument === undefined || verdictArgument === undefined) {
	throw new Error('Usage: mutation-verdict-check.ts <lane> <scope> <report> <verdict>');
}

const verdict = await verifyMutationFiles({
	projectRoot,
	lane: lane as MutationLane,
	scopePath: path.resolve(projectRoot, scopeArgument),
	reportPath: path.resolve(projectRoot, reportArgument),
	policyPath: path.join(projectRoot, 'quality', 'mutation-policy.json'),
	ledgerPath: path.join(projectRoot, 'quality', 'mutation-equivalents.json'),
	verdictPath: path.resolve(projectRoot, verdictArgument),
	startedAt: 0
});
if (!verdict.ok) {
	for (const failure of verdict.failures) console.error(failure);
	process.exitCode = 1;
}
