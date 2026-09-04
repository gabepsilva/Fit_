import { execFileSync, spawn } from 'node:child_process';
import { createSign } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

const DEFAULT_APP_ID = '4578638';
const GITHUB_API = 'https://api.github.com';
const JWT_ISSUED_SKEW_SECONDS = 60;
const JWT_LIFETIME_SECONDS = 9 * 60;

export interface Dependencies {
	readKeyFile: (path: string) => string;
	/** Undefined means the path does not exist or cannot be stat'd. */
	statKeyFile: (path: string) => { mode: number } | undefined;
	fetchImpl: typeof fetch;
	spawnChild: (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<number>;
	getOriginUrl: () => string;
	/** Milliseconds since epoch, matching `Date.now()`. */
	now: () => number;
}

export function realDependencies(): Dependencies {
	return {
		readKeyFile: (path) => readFileSync(path, 'utf8'),
		statKeyFile: (path) => {
			try {
				return { mode: statSync(path).mode };
			} catch {
				return undefined;
			}
		},
		fetchImpl: fetch,
		spawnChild: (command, args, env) =>
			new Promise((resolve, reject) => {
				const child = spawn(command, args, { env, stdio: 'inherit' });
				child.on('error', reject);
				child.on('close', (code) => resolve(code ?? 1));
			}),
		getOriginUrl: () =>
			execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim(),
		now: () => Date.now()
	};
}

function base64url(input: Buffer | string): string {
	return Buffer.from(input).toString('base64url');
}

/**
 * Mints an RS256 app JWT by hand: `node:crypto` signs, nothing else is needed
 * for a token this small, and pulling in a JWT library for three fields would
 * be a new dependency the script does not need.
 */
export function mintAppJwt(appId: string, privateKeyPem: string, nowMs: number): string {
	const nowSeconds = Math.floor(nowMs / 1000);
	const header = { alg: 'RS256', typ: 'JWT' };
	const payload = {
		iat: nowSeconds - JWT_ISSUED_SKEW_SECONDS,
		exp: nowSeconds + JWT_LIFETIME_SECONDS,
		iss: Number(appId)
	};
	const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
	const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKeyPem);
	return `${signingInput}.${base64url(signature)}`;
}

export function parseOwnerRepo(remoteUrl: string): { owner: string; repo: string } {
	const match = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(remoteUrl.trim());
	const owner = match?.[1];
	const repo = match?.[2];
	if (owner === undefined || repo === undefined) {
		throw new Error(`Could not parse an owner/repo from the origin remote: ${remoteUrl}`);
	}
	return { owner, repo };
}

export function assertKeyPermissions(mode: number, keyPath: string): void {
	if ((mode & 0o077) !== 0) {
		throw new Error(
			`Refusing to run: ${keyPath} is readable by group or others (mode ${(mode & 0o777).toString(8)}). Run "chmod 600 ${keyPath}".`
		);
	}
}

function githubHeaders(jwt: string): Record<string, string> {
	return {
		Authorization: `Bearer ${jwt}`,
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
		'User-Agent': 'fit-as-owen-script'
	};
}

export async function fetchInstallationId(
	fetchImpl: typeof fetch,
	jwt: string,
	owner: string,
	repo: string
): Promise<number> {
	const response = await fetchImpl(`${GITHUB_API}/repos/${owner}/${repo}/installation`, {
		headers: githubHeaders(jwt)
	});
	if (!response.ok) {
		throw new Error(
			`Failed to find the app installation for ${owner}/${repo}: ${response.status} ${response.statusText}`
		);
	}
	const body = (await response.json()) as { id: number };
	return body.id;
}

export async function fetchInstallationToken(
	fetchImpl: typeof fetch,
	jwt: string,
	installationId: number
): Promise<string> {
	const response = await fetchImpl(
		`${GITHUB_API}/app/installations/${String(installationId)}/access_tokens`,
		{ method: 'POST', headers: githubHeaders(jwt) }
	);
	if (!response.ok) {
		throw new Error(
			`Failed to mint an installation token: ${response.status} ${response.statusText}`
		);
	}
	const body = (await response.json()) as { token: string };
	return body.token;
}

function readKeyPathOrFail(env: NodeJS.ProcessEnv): string | undefined {
	const keyPath = env.FIT_GITHUB_APP_KEY;
	if (keyPath === undefined || keyPath === '') {
		console.error('FIT_GITHUB_APP_KEY is not set. Point it at the app private key file.');
		return undefined;
	}
	return keyPath;
}

/**
 * Runs the whole flow: validate the key file, mint a JWT, exchange it for an
 * installation token, and hand that token to the child process. Every
 * dependency that touches the filesystem, the network, or another process is
 * injected so tests can run with no real key, no network, and no child.
 */
export async function run(
	argv: string[],
	env: NodeJS.ProcessEnv,
	deps: Dependencies
): Promise<number> {
	const command = argv[0];
	if (command === undefined) {
		console.error('Usage: as-owen.ts <command> [args...]');
		return 1;
	}

	const keyPath = readKeyPathOrFail(env);
	if (keyPath === undefined) return 1;

	const stats = deps.statKeyFile(keyPath);
	if (stats === undefined) {
		console.error(`FIT_GITHUB_APP_KEY does not point to a readable file: ${keyPath}`);
		return 1;
	}
	try {
		assertKeyPermissions(stats.mode, keyPath);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}

	const appId = env.FIT_GITHUB_APP_ID ?? DEFAULT_APP_ID;
	const privateKeyPem = deps.readKeyFile(keyPath);
	const jwt = mintAppJwt(appId, privateKeyPem, deps.now());

	let token: string;
	try {
		const { owner, repo } = parseOwnerRepo(deps.getOriginUrl());
		const installationId = await fetchInstallationId(deps.fetchImpl, jwt, owner, repo);
		token = await fetchInstallationToken(deps.fetchImpl, jwt, installationId);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}

	return deps.spawnChild(command, argv.slice(1), { ...env, GH_TOKEN: token });
}

if (import.meta.main) {
	const exitCode = await run(process.argv.slice(2), process.env, realDependencies());
	process.exitCode = exitCode;
}
