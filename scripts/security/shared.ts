import { execFile, spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const reportsRoot = path.join(projectRoot, 'reports', 'security');
export const cacheRoot = path.join(projectRoot, '.security-cache');

interface RunOptions {
	allowFailure?: boolean;
	env?: NodeJS.ProcessEnv;
}

export async function assertDocker(): Promise<void> {
	try {
		await execFileAsync('docker', ['info', '--format', '{{.ServerVersion}}']);
	} catch {
		throw new Error('Docker is required and its daemon must be running.');
	}
}

export async function resetReportDirectory(name: string): Promise<string> {
	const directory = path.join(reportsRoot, name);
	await rm(directory, { recursive: true, force: true });
	await mkdir(directory, { recursive: true });
	return directory;
}

export async function ensureDirectory(directory: string): Promise<void> {
	await mkdir(directory, { recursive: true });
}

export async function run(
	command: string,
	args: string[],
	options: RunOptions = {}
): Promise<number> {
	const exitCode = await new Promise<number>((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: projectRoot,
			env: options.env ?? process.env,
			stdio: 'inherit'
		});
		child.on('error', reject);
		child.on('close', (code) => resolve(code ?? 1));
	});

	if (exitCode !== 0 && !options.allowFailure) {
		throw new Error(`${command} exited with code ${exitCode}.`);
	}

	return exitCode;
}

export interface CaptureResult {
	exitCode: number;
	/** stdout and stderr interleaved, for logs and human output. */
	output: string;
	/** stdout alone, for callers parsing machine-readable output. */
	stdout: string;
	stderr: string;
}

/**
 * Runs a command to completion, collecting stdout and stderr instead of failing
 * on a non-zero exit. Callers decide what a non-zero status means.
 */
export async function captureStatus(
	command: string,
	args: string[],
	options: { stream?: boolean; env?: NodeJS.ProcessEnv; cwd?: string } = {}
): Promise<CaptureResult> {
	const combined: string[] = [];
	const out: string[] = [];
	const err: string[] = [];
	const exitCode = await new Promise<number>((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd ?? projectRoot,
			env: options.env ?? process.env,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		for (const [stream, sink] of [
			[child.stdout, out],
			[child.stderr, err]
		] as const) {
			stream.setEncoding('utf8');
			stream.on('data', (chunk: string) => {
				sink.push(chunk);
				combined.push(chunk);
				if (options.stream === true) process.stdout.write(chunk);
			});
		}
		child.on('error', reject);
		child.on('close', (code) => resolve(code ?? 1));
	});

	return { exitCode, output: combined.join(''), stdout: out.join(''), stderr: err.join('') };
}

export async function capture(command: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync(command, args, {
		cwd: projectRoot,
		maxBuffer: 10 * 1024 * 1024
	});
	return stdout.trim();
}

export function hostUser(): string {
	const userId = process.getuid?.();
	const groupId = process.getgid?.();
	return userId === undefined || groupId === undefined ? '1000:1000' : `${userId}:${groupId}`;
}
