import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { ciJobs } from './gates';
import { e2eProjects } from './e2e-projects';
import { fixtures } from './fixtures';
import { groupRequirements, selfTestGroupNames } from './self-test-groups';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const [workflow, makefile] = await Promise.all([
	readFile(path.join(projectRoot, '.github', 'workflows', 'ci.yml'), 'utf8'),
	readFile(path.join(projectRoot, 'Makefile'), 'utf8')
]);

function referencedJobs(source: string): Set<string> {
	return new Set(
		[...source.matchAll(/(?:--job|job:)\s+([a-z][a-z0-9-]*)/g)].map((match) => match[1] ?? '')
	);
}

function workflowJobSections(source: string): Map<string, string> {
	const jobsStart = source.indexOf('\njobs:\n');
	if (jobsStart < 0) return new Map();
	const jobs = source.slice(jobsStart + 1);
	const headings = [...jobs.matchAll(/^ {2}([a-z][a-z0-9-]*):\s*$/gm)];
	return new Map(
		headings.map((heading, index) => {
			const name = heading[1] ?? '';
			const start = (heading.index ?? 0) + heading[0].length;
			const end = headings[index + 1]?.index ?? jobs.length;
			return [name, jobs.slice(start, end)];
		})
	);
}

function neededJobs(job: string): Set<string> {
	const inline = /^ {4}needs:\s*\[([^\]]*)\]\s*$/m.exec(job);
	if (inline !== null) {
		return new Set(
			(inline[1] ?? '')
				.split(',')
				.map((entry) => entry.trim())
				.filter(Boolean)
		);
	}
	const block = /^ {4}needs:\s*\n((?: {6}- [a-z][a-z0-9-]*\s*\n?)*)/m.exec(job);
	return new Set(
		[...(block?.[1] ?? '').matchAll(/^ {6}- ([a-z][a-z0-9-]*)\s*$/gm)].map(
			(match) => match[1] ?? ''
		)
	);
}

/**
 * Sharded jobs are the third way this contract can break. A declared job can be
 * present and protected while the matrix that fans it out has quietly lost an
 * entry -- a browser project nobody runs any more, or a self-test group whose
 * fixtures stopped proving anything -- and the check would still be green,
 * because the job name and the gate command are both still there.
 */
function matrixValues(job: string, key: string): Set<string> {
	return new Set(
		[...job.matchAll(new RegExp(`^ {10,}(?:- )?${key}:\\s*([a-z][a-z0-9-]*)\\s*$`, 'gm'))].map(
			(match) => match[1] ?? ''
		)
	);
}

/** The `docker:`/`browser:` flags declared beside one matrix entry's `group:`. */
function selfTestMatrixFlags(job: string, group: string): { docker: boolean; browser: boolean } {
	const entry = new RegExp(`^ {10}- group: ${group}\\s*$\\n((?: {12}\\w+: .*\\s*$\\n)*)`, 'm').exec(
		job
	);
	const body = entry?.[1] ?? '';
	return {
		docker: /^ {12}docker: true\s*$/m.test(body),
		browser: /^ {12}browser: true\s*$/m.test(body)
	};
}

/**
 * A self-test group need not live in the `self-test` matrix: `mutation` runs
 * conditionally (2026-09-05), which a job-level `if:` cannot express while
 * reading `matrix.group` -- GitHub restricts that context to `github`,
 * `needs`, `vars` and `inputs` -- so it is its own job, `self-test-mutation`,
 * gated by `needs.self-test-scope` instead. Any job whose body runs the gate
 * self-test with a `SELF_TEST_GROUP` naming a known group counts toward
 * coverage the same as a matrix leg would.
 */
function standaloneSelfTestGroups(sections: ReadonlyMap<string, string>): Set<string> {
	const groups = new Set<string>();
	for (const [name, body] of sections) {
		if (name === 'self-test' || !/gate\.ts ci --job self-test\b/.test(body)) continue;
		const group = /^ {6}SELF_TEST_GROUP: ([a-z][a-z0-9-]*)\s*$/m.exec(body)?.[1];
		if (group !== undefined && selfTestGroupNames.includes(group)) groups.add(group);
	}
	return groups;
}

interface ConditionalSelfTestJob {
	name: string;
	scopeJob: string;
	scopeOutput: string;
}

/**
 * A standalone self-test job whose own `if:` reads another job's output --
 * `self-test-mutation` reading `needs.self-test-scope.outputs.mutation-needed`
 * -- so it can report `skipped` for a legitimate reason. `all-green` has to
 * tell that apart from a `skipped` for any other reason (the scope job
 * itself failing, say), which the check below proves it does.
 */
function conditionalSelfTestJobs(sections: ReadonlyMap<string, string>): ConditionalSelfTestJob[] {
	const jobs: ConditionalSelfTestJob[] = [];
	for (const [name, body] of sections) {
		if (name === 'self-test' || name === 'all-green') continue;
		if (!/gate\.ts ci --job self-test\b/.test(body)) continue;
		const conditional = /^ {4}if:.*needs\.([a-z][a-z0-9-]*)\.outputs\.([a-zA-Z0-9_-]+)/m.exec(body);
		const scopeJob = conditional?.[1];
		const scopeOutput = conditional?.[2];
		if (scopeJob !== undefined && scopeOutput !== undefined)
			jobs.push({ name, scopeJob, scopeOutput });
	}
	return jobs;
}

/**
 * `all-green` may only accept a conditional self-test job's `skipped` result
 * when it also reads the same scope output the job's own `if:` reads, next to
 * the literal word `skipped` -- proof it is comparing the result, not merely
 * mentioning the job. Anything less would let a `skipped` through for any
 * reason, including the scope job itself failing.
 */
function ungatedConditionalSkips(
	allGreenBody: string,
	jobs: readonly ConditionalSelfTestJob[]
): string[] {
	return jobs
		.filter(
			(job) =>
				!(
					allGreenBody.includes(`needs.${job.name}.result`) &&
					allGreenBody.includes(`needs.${job.scopeJob}.outputs.${job.scopeOutput}`) &&
					/skipped/.test(allGreenBody)
				)
		)
		.map((job) => job.name);
}

const expected = Object.keys(ciJobs).sort();
const workflowJobs = referencedJobs(workflow);
const makeJobs = referencedJobs(makefile);
const workflowSections = workflowJobSections(workflow);
const hostedGateJobs = [...workflowSections]
	.filter(([name, body]) => name !== 'all-green' && /gate\.ts ci --job/.test(body))
	.map(([name]) => name)
	.sort();
const protectedJobs = neededJobs(workflowSections.get('all-green') ?? '');
const missingWorkflow = expected.filter((job) => !workflowJobs.has(job));
const missingMake = expected.filter((job) => !makeJobs.has(job));
const missingProtection = hostedGateJobs.filter((job) => !protectedJobs.has(job));
const e2eJob = workflowSections.get('e2e') ?? '';
const runProjects = matrixValues(e2eJob, 'project');
const missingProjects = Object.keys(e2eProjects).filter((project) => !runProjects.has(project));
const selfTestJob = workflowSections.get('self-test') ?? '';
const runGroups = matrixValues(selfTestJob, 'group');
const standaloneGroups = standaloneSelfTestGroups(workflowSections);
const allRunGroups = new Set([...runGroups, ...standaloneGroups]);
const missingGroups = selfTestGroupNames.filter((group) => !allRunGroups.has(group));
const wronglySetUpGroups = selfTestGroupNames
	.filter((group) => runGroups.has(group))
	.filter((group) => {
		const declared = selfTestMatrixFlags(selfTestJob, group);
		const needed = groupRequirements(fixtures, group);
		return declared.docker !== needed.docker || declared.browser !== needed.browser;
	});
const allGreenJob = workflowSections.get('all-green') ?? '';
const conditionalJobs = conditionalSelfTestJobs(workflowSections);
const ungatedSkips = ungatedConditionalSkips(allGreenJob, conditionalJobs);
const failures = [
	...(missingWorkflow.length === 0
		? []
		: [`CI workflow does not invoke declared jobs: ${missingWorkflow.join(', ')}`]),
	...(missingMake.length === 0
		? []
		: [`Makefile does not invoke declared jobs: ${missingMake.join(', ')}`]),
	...(missingProtection.length === 0
		? []
		: [`all-green.needs does not protect hosted gate jobs: ${missingProtection.join(', ')}`]),
	...(missingProjects.length === 0
		? []
		: [`CI workflow does not run every end-to-end project: ${missingProjects.join(', ')}`]),
	...(missingGroups.length === 0
		? []
		: [`CI workflow does not run every gate self-test group: ${missingGroups.join(', ')}`]),
	...(wronglySetUpGroups.length === 0
		? []
		: [
				`Gate self-test matrix declares the wrong setup for: ${wronglySetUpGroups.join(', ')}. Compare scripts/quality/self-test-groups.ts.`
			]),
	...(ungatedSkips.length === 0
		? []
		: [
				`all-green does not gate the following conditional self-test jobs' skipped result on their own scope output: ${ungatedSkips.join(', ')}`
			])
];

if (failures.length === 0) {
	console.log(
		`CI contract: ${expected.length} declared jobs are wired locally, ${hostedGateJobs.length} hosted jobs are protected by all-green, and the matrices run ${runProjects.size} end-to-end projects and ${allRunGroups.size} self-test groups.`
	);
} else {
	for (const failure of failures) console.error(failure);
	process.exitCode = 1;
}
