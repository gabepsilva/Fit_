import path from 'node:path';
import { existsSync } from 'node:fs';
import { capture, projectRoot, run } from '../security/shared';

/**
 * `worktree:new` and `worktree:done`: the two ends of the throwaway worktree
 * every agent and every deploy already uses. Before this, each one ran
 * `git worktree add` by hand and then discovered `bun install` was still
 * needed — every agent tonight paid that lesson, and one deploy agent lost
 * real time to it. `new` folds both steps together and hands back the path;
 * `done` is the cleanup half, refusing to discard work nobody has committed
 * or pushed.
 *
 * Both commands are a pure decision — `planNew`/`planDone` — around thin IO.
 * The decision is what a spec exercises; the IO is wiring nothing here
 * checks twice.
 */

/** Where an agent's worktree lives, matching `.gitignore`'s `/.claude/worktrees`. */
export const WORKTREES_ROOT = path.join(projectRoot, '.claude', 'worktrees');

const DEFAULT_BASE = 'origin/main';

export interface NewPlanInput {
	path: string;
	branch: string;
	base: string;
	pathExists: boolean;
	branchExists: boolean;
}

export type NewPlan =
	| { action: 'create'; path: string; branch: string; base: string }
	| { action: 'refuse'; reason: string };

/** Refuses a path or branch that already exists; otherwise plans the worktree to create. */
export function planNew(input: NewPlanInput): NewPlan {
	if (input.pathExists) {
		return { action: 'refuse', reason: `${input.path} already exists` };
	}
	if (input.branchExists) {
		return { action: 'refuse', reason: `branch ${input.branch} already exists` };
	}
	return { action: 'create', path: input.path, branch: input.branch, base: input.base };
}

export interface DonePlanInput {
	path: string;
	branch: string;
	/** `git status --porcelain` in the worktree was non-empty. */
	dirty: boolean;
	/** Commits reachable from the branch but not from `origin/main`, oldest first. */
	aheadCommits: string[];
	force: boolean;
}

export type DonePlan =
	| { action: 'remove'; path: string; branch: string; deleteBranch: boolean }
	| { action: 'refuse'; reasons: string[] };

/**
 * Refuses to discard uncommitted changes or commits `origin/main` has never
 * seen, unless `force` overrides both. The branch is deleted only when it is
 * merged into `origin/main` — the same "nothing ahead" fact `force` never
 * gets to fake, because this never reaches for `git branch -D`.
 */
export function planDone(input: DonePlanInput): DonePlan {
	const reasons: string[] = [];
	if (input.dirty) reasons.push(`${input.path} has uncommitted changes`);
	if (input.aheadCommits.length > 0) {
		reasons.push(
			`${input.branch} has commits origin/main does not: ${input.aheadCommits.join(', ')}`
		);
	}
	if (reasons.length > 0 && !input.force) {
		return { action: 'refuse', reasons };
	}
	return {
		action: 'remove',
		path: input.path,
		branch: input.branch,
		deleteBranch: input.aheadCommits.length === 0
	};
}

interface NewOptions {
	slug: string;
	base: string;
}

function parseNewArguments(argv: string[]): NewOptions {
	const [slug, ...rest] = argv;
	if (slug === undefined || slug === '') {
		throw new Error('Usage: worktree.ts new <slug> [--base <ref>]');
	}
	let base = DEFAULT_BASE;
	for (let index = 0; index < rest.length; index += 1) {
		if (rest[index] === '--base') {
			const value = rest[index + 1];
			if (value === undefined) throw new Error('--base requires a ref.');
			base = value;
			index += 1;
		} else throw new Error(`Unknown argument: ${rest[index] ?? ''}`);
	}
	return { slug, base };
}

async function branchExists(branch: string): Promise<boolean> {
	const result = await run('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], {
		allowFailure: true
	});
	return result === 0;
}

/** `new`: fetch, plan, create the worktree, install, print the absolute path. */
export async function newWorktree(argv: string[]): Promise<boolean> {
	const { slug, base } = parseNewArguments(argv);
	await run('git', ['fetch', 'origin']);
	const worktreePath = path.join(WORKTREES_ROOT, slug);
	const plan = planNew({
		path: worktreePath,
		branch: slug,
		base,
		pathExists: existsSync(worktreePath),
		branchExists: await branchExists(slug)
	});
	if (plan.action === 'refuse') {
		console.error(`Refusing: ${plan.reason}`);
		return false;
	}
	await run('git', ['worktree', 'add', plan.path, '-b', plan.branch, plan.base]);
	await run('bun', ['install', '--frozen-lockfile'], { cwd: plan.path });
	console.log(plan.path);
	return true;
}

interface DoneOptions {
	slugOrPath: string;
	force: boolean;
}

function parseDoneArguments(argv: string[]): DoneOptions {
	const [slugOrPath, ...rest] = argv;
	if (slugOrPath === undefined || slugOrPath === '') {
		throw new Error('Usage: worktree.ts done <slug-or-path> [--force]');
	}
	const force = rest.includes('--force');
	const unknown = rest.filter((argument) => argument !== '--force');
	if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown[0] ?? ''}`);
	return { slugOrPath, force };
}

function resolveWorktreePath(slugOrPath: string): string {
	return path.isAbsolute(slugOrPath) || slugOrPath.includes(path.sep)
		? path.resolve(slugOrPath)
		: path.join(WORKTREES_ROOT, slugOrPath);
}

async function currentBranch(worktreePath: string): Promise<string> {
	return capture('git', ['-C', worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD']);
}

async function isDirty(worktreePath: string): Promise<boolean> {
	return (await capture('git', ['-C', worktreePath, 'status', '--porcelain'])) !== '';
}

async function commitsAheadOfMain(worktreePath: string, branch: string): Promise<string[]> {
	const output = await capture('git', [
		'-C',
		worktreePath,
		'log',
		'--oneline',
		`origin/main..${branch}`
	]);
	return output === '' ? [] : output.split('\n');
}

/** `done`: refuse or remove the worktree, and delete the branch only when merged. */
export async function doneWorktree(argv: string[]): Promise<boolean> {
	const { slugOrPath, force } = parseDoneArguments(argv);
	const worktreePath = resolveWorktreePath(slugOrPath);
	if (!existsSync(worktreePath)) {
		console.error(`Refusing: ${worktreePath} does not exist`);
		return false;
	}
	await run('git', ['fetch', 'origin']);
	const branch = await currentBranch(worktreePath);
	const plan = planDone({
		path: worktreePath,
		branch,
		dirty: await isDirty(worktreePath),
		aheadCommits: await commitsAheadOfMain(worktreePath, branch),
		force
	});
	if (plan.action === 'refuse') {
		console.error(`Refusing:\n${plan.reasons.map((reason) => `  ${reason}`).join('\n')}`);
		return false;
	}
	await run('git', ['worktree', 'remove', ...(force ? ['--force'] : []), plan.path]);
	if (plan.deleteBranch) {
		await run('git', ['branch', '-d', plan.branch]);
	} else {
		console.log(`Leaving branch ${plan.branch}: not merged into origin/main.`);
	}
	return true;
}

if (import.meta.main) {
	const [command, ...rest] = process.argv.slice(2);
	if (command === 'new') {
		process.exitCode = (await newWorktree(rest)) ? 0 : 1;
	} else if (command === 'done') {
		process.exitCode = (await doneWorktree(rest)) ? 0 : 1;
	} else {
		throw new Error(`Usage: worktree.ts <new|done> ...`);
	}
}
