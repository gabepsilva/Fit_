import { execFile } from 'node:child_process';
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	readlink,
	rm,
	symlink,
	writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { activationScript } from './activation';

/**
 * The switch is run for real, against a temporary directory standing in for
 * `/opt/fit` and stub executables standing in for the machine.
 *
 * Asserting on the generated text instead would prove the script mentions the
 * previous release, which is what it did before this rollback existed: the
 * question is where the symlink ends up when the new release never answers,
 * and only running the script answers it.
 */

/** Two attempts, so an unhealthy release is judged in a test's worth of time. */
const ATTEMPTS = 2;

const bash = promisify(execFile);

type Machine = {
	root: string;
	currentLink: string;
	releases: Record<'old' | 'next', string>;
	/** Release paths `curl` will answer for; anything else is a connection refused. */
	setHealthy: (releases: string[]) => Promise<void>;
	/** Make `systemctl restart` exit non-zero, as a unit systemd refuses to start does. */
	failRestarts: () => Promise<void>;
	run: (previous: string | null) => Promise<{ code: number; stderr: string }>;
	live: () => Promise<string>;
	restarts: () => Promise<number>;
};

/**
 * The stubs are shell scripts on `PATH` rather than mocks, because the script
 * under test is shell: its control flow is exit statuses, and only a process
 * that really exits produces those.
 *
 * `curl` reads the symlink the script just wrote, so "is it healthy" is
 * answered by which release is live at that moment. That is what makes the
 * rollback's own health wait meaningful: the old release answers only once the
 * link is back on it.
 */
async function machine(): Promise<Machine> {
	const root = await mkdtemp(path.join(os.tmpdir(), 'fit-activate-'));
	const bin = path.join(root, 'bin');
	const currentLink = path.join(root, 'current');
	const healthyFile = path.join(root, 'healthy');
	const restartLog = path.join(root, 'restarts');
	const restartExit = path.join(root, 'restart-exit');
	const releases = {
		old: path.join(root, 'releases', 'old'),
		next: path.join(root, 'releases', 'next')
	};
	await mkdir(bin, { recursive: true });
	for (const release of Object.values(releases)) await mkdir(release, { recursive: true });
	await writeFile(healthyFile, '');
	await writeFile(restartLog, '');
	await writeFile(restartExit, '0');
	await symlink(releases.old, currentLink);

	const stub = async (name: string, body: string): Promise<void> => {
		const file = path.join(bin, name);
		await writeFile(file, `#!/bin/sh\n${body}\n`);
		await chmod(file, 0o755);
	};
	await stub('curl', `grep -Fxq "$(readlink -f ${currentLink})" ${healthyFile}`);
	await stub(
		'systemctl',
		`echo "$*" >> ${restartLog}\nif [ "$1" = restart ]; then exit "$(cat ${restartExit})"; fi\nexit 0`
	);
	await stub('journalctl', 'exit 0');
	await stub('sleep', 'exit 0');

	return {
		root,
		currentLink,
		releases,
		setHealthy: async (paths) => writeFile(healthyFile, `${paths.join('\n')}\n`),
		failRestarts: async () => writeFile(restartExit, '1'),
		run: async (previous) => {
			const script = activationScript({
				target: releases.next,
				previous,
				currentLink,
				serviceName: 'fit',
				port: 80,
				healthPath: '/signin',
				attempts: ATTEMPTS
			});
			try {
				const { stderr } = await bash('bash', ['-euo', 'pipefail', '-c', script], {
					env: { PATH: `${bin}:${process.env['PATH'] ?? ''}` }
				});
				return { code: 0, stderr };
			} catch (error) {
				const failure = error as { code?: number; stderr?: string };
				return { code: failure.code ?? 1, stderr: failure.stderr ?? '' };
			}
		},
		live: async () => readlink(currentLink),
		restarts: async () =>
			(await readFile(restartLog, 'utf8')).split('\n').filter((line) => line.startsWith('restart'))
				.length
	};
}

describe('activating a release', () => {
	let target: Machine | undefined;

	afterEach(async () => {
		if (target !== undefined) await rm(target.root, { recursive: true, force: true });
		target = undefined;
	});

	it('leaves the new release live when it answers', async () => {
		target = await machine();
		await target.setHealthy([target.releases.next]);
		const { code } = await target.run(target.releases.old);
		expect(code).toBe(0);
		expect(await target.live()).toBe(target.releases.next);
	});

	it('puts the previous release back when the new one never answers', async () => {
		// The deploy still fails. What must not also fail is the site: before
		// this, `current` was left pointing at a release that does not start and
		// Cloudflare served the error to whoever asked next.
		target = await machine();
		await target.setHealthy([target.releases.old]);
		const { code, stderr } = await target.run(target.releases.old);
		expect(code).not.toBe(0);
		expect(await target.live()).toBe(target.releases.old);
		expect(stderr).toContain(`rolled back: ${target.currentLink} -> ${target.releases.old}`);
	});

	it('restarts the service on the way back, so the old release is running again', async () => {
		// The symlink alone changes nothing: the unit holds its release open
		// until something restarts it.
		target = await machine();
		await target.setHealthy([target.releases.old]);
		await target.run(target.releases.old);
		expect(await target.restarts()).toBe(2);
	});

	it('rolls back when the restart itself fails, not only when the release is silent', async () => {
		// `remote()` prepends `set -euo pipefail`, so a `systemctl restart` that
		// exits non-zero used to abort the script here — before the health wait,
		// and so before the rollback, leaving `current` on a release that never
		// started. A unit systemd refuses (a bad directive, a namespace it
		// cannot set up, a start job that times out) fails exactly this way, and
		// it is the case the rollback exists for.
		target = await machine();
		await target.setHealthy([target.releases.old]);
		await target.failRestarts();
		const { code, stderr } = await target.run(target.releases.old);
		expect(code).not.toBe(0);
		expect(await target.live()).toBe(target.releases.old);
		expect(stderr).toContain('rolled back');
	});

	it('says so rather than claiming a recovery when the previous release is down too', async () => {
		target = await machine();
		await target.setHealthy([]);
		const { code, stderr } = await target.run(target.releases.old);
		expect(code).not.toBe(0);
		expect(stderr).toContain('did not answer either');
		expect(await target.live()).toBe(target.releases.old);
	});

	it('has nowhere to go back to on a machine with no live release', async () => {
		target = await machine();
		await target.setHealthy([]);
		const { code, stderr } = await target.run(null);
		expect(code).not.toBe(0);
		expect(stderr).toContain('no previous release to roll back to');
		expect(await target.live()).toBe(target.releases.next);
	});
});
