import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { activationScript } from './activation';
import { activateAndPrune, describeActivationFailure } from './rollout';

const bash = promisify(execFile);

/**
 * Runs a real rollback through `activationScript()`, the same stub-binary
 * approach `activation.spec.ts` uses against a temporary directory standing
 * in for `/opt/fit`, and returns the stderr `remote()` would see.
 *
 * This is what proves `describeActivationFailure` is reading text the
 * machine actually produces, rather than text this spec made up to match it.
 */
async function rolledBackStderr(): Promise<{ stderr: string; previous: string }> {
	const root = await mkdtemp(path.join(os.tmpdir(), 'fit-rollout-'));
	try {
		const bin = path.join(root, 'bin');
		const currentLink = path.join(root, 'current');
		const releases = {
			old: path.join(root, 'releases', 'old'),
			next: path.join(root, 'releases', 'next')
		};
		await mkdir(bin, { recursive: true });
		for (const release of Object.values(releases)) await mkdir(release, { recursive: true });
		await symlink(releases.old, currentLink);

		const stub = async (name: string, body: string): Promise<void> => {
			const file = path.join(bin, name);
			await writeFile(file, `#!/bin/sh\n${body}\n`);
			await chmod(file, 0o755);
		};
		// Only the old release ever answers, so switching to `next` fails and
		// rolling back to `old` succeeds.
		await stub('curl', `[ "$(readlink -f ${currentLink})" = "${releases.old}" ]`);
		await stub('systemctl', 'exit 0');
		await stub('journalctl', 'exit 0');
		await stub('sleep', 'exit 0');

		const script = activationScript({
			target: releases.next,
			previous: releases.old,
			currentLink,
			serviceName: 'fit',
			port: 80,
			healthPath: '/signin',
			attempts: 2
		});

		try {
			await bash('bash', ['-euo', 'pipefail', '-c', script], {
				env: { PATH: `${bin}:${process.env['PATH'] ?? ''}` }
			});
			throw new Error('expected the activation script to fail');
		} catch (error) {
			const failure = error as { stderr?: string };
			return { stderr: failure.stderr ?? '', previous: releases.old };
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

describe('describing a rolled-back deploy', () => {
	it('states what failed, which release was restored, and that it answered its health check', async () => {
		const { stderr, previous } = await rolledBackStderr();
		const report = describeActivationFailure({ stderr }, 'abc123', previous);
		expect(report).toContain('abc123 did not go live.');
		expect(report).toContain(previous);
		expect(report).toContain(`rolled back:`);
	});

	it('says so, rather than claiming a release was restored, when the machine had nothing to fall back to', () => {
		const report = describeActivationFailure(
			{ stderr: 'no previous release to roll back to\n' },
			'abc123',
			null
		);
		expect(report).toContain('No previous release existed on the machine');
		expect(report).toContain('no previous release to roll back to');
	});

	it('falls back to the error message when the failure carries no stderr', () => {
		const report = describeActivationFailure(new Error('connection refused'), 'abc123', 'old');
		expect(report).toContain('connection refused');
	});

	it('never repeats the base64-encoded script the crash dump used to show', () => {
		const execError = Object.assign(
			new Error('Command failed: ssh … echo QmFzZTY0Cg== | base64 -d | sudo bash'),
			{ stderr: 'rolled back: /opt/fit/current -> /opt/fit/releases/old\n' }
		);
		const report = describeActivationFailure(execError, 'abc123', 'old');
		expect(report).not.toContain('base64');
		expect(report).not.toContain('QmFzZTY0Cg==');
	});
});

describe('activateAndPrune', () => {
	it('prunes after a successful activation', async () => {
		const calls: string[] = [];
		await activateAndPrune(
			() => {
				calls.push('activate');
				return Promise.resolve();
			},
			() => {
				calls.push('prune');
				return Promise.resolve();
			}
		);
		expect(calls).toEqual(['activate', 'prune']);
	});

	it('still prunes when activation throws, and lets the error through afterward', async () => {
		const calls: string[] = [];
		await expect(
			activateAndPrune(
				() => {
					calls.push('activate');
					return Promise.reject(new Error('did not answer'));
				},
				() => {
					calls.push('prune');
					return Promise.resolve();
				}
			)
		).rejects.toThrow('did not answer');
		expect(calls).toEqual(['activate', 'prune']);
	});
});
