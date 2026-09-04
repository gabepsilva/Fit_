import { spawnSync } from 'node:child_process';

/**
 * Build once for the whole run.
 *
 * This was `webServer.command`, which also started the one shared server. The
 * servers are per worker now (`preview-server.ts`), and they all serve the same
 * output, so the build belongs to the run rather than to any one of them.
 */
export default function build(): void {
	const { status } = spawnSync('bun', ['run', 'build'], { stdio: 'inherit' });
	if (status !== 0)
		throw new Error(`The production build the suite runs against failed (${String(status)}).`);
}
