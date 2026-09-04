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
const missingGroups = selfTestGroupNames.filter((group) => !runGroups.has(group));
const wronglySetUpGroups = selfTestGroupNames
	.filter((group) => runGroups.has(group))
	.filter((group) => {
		const declared = selfTestMatrixFlags(selfTestJob, group);
		const needed = groupRequirements(fixtures, group);
		return declared.docker !== needed.docker || declared.browser !== needed.browser;
	});
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
			])
];

if (failures.length === 0) {
	console.log(
		`CI contract: ${expected.length} declared jobs are wired locally, ${hostedGateJobs.length} hosted jobs are protected by all-green, and the matrices run ${runProjects.size} end-to-end projects and ${runGroups.size} self-test groups.`
	);
} else {
	for (const failure of failures) console.error(failure);
	process.exitCode = 1;
}
