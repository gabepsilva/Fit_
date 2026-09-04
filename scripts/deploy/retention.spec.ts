import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { ASSET_GENERATIONS, IMMUTABLE_ASSETS, RELEASE_ASSETS } from './retention';
import { pruneReleasesScript, retainAssetsScript } from './retention';

/**
 * Both scripts are run for real against a temporary directory standing in for
 * `/opt/fit`, the way `activation.spec.ts` runs the switch: what is being
 * asserted is which files a device can still be served after a deploy, and
 * only the filesystem answers that.
 */

const bash = promisify(execFile);

/** How many releases the machine keeps whole, as `config.ts` sets it. */
const KEPT = 5;

let root: string | undefined;

afterEach(async () => {
	if (root !== undefined) await rm(root, { recursive: true, force: true });
	root = undefined;
});

type Machine = {
	root: string;
	releasesRoot: string;
	currentLink: string;
	/** Creates a release directory holding one hashed chunk of its own. */
	ship: (release: string) => Promise<string>;
	/** The retention step of a deploy, then the switch, then the prune. */
	deploy: (release: string, generations?: number) => Promise<void>;
	chunks: (release: string) => Promise<string[]>;
	exists: (relative: string) => Promise<boolean>;
};

async function machine(): Promise<Machine> {
	root = await mkdtemp(path.join(os.tmpdir(), 'fit-retention-'));
	const base = root;
	const releasesRoot = path.join(base, 'releases');
	const currentLink = path.join(base, 'current');
	await mkdir(releasesRoot, { recursive: true });
	// `ls -t` decides which releases are recent, so each one is stamped a
	// minute after the last rather than left to the clock's resolution.
	let stamp = new Date('2026-01-01T00:00:00Z').getTime();

	const run = async (script: string): Promise<void> => {
		await bash('bash', ['-euo', 'pipefail', '-c', script]);
	};

	const ship = async (release: string): Promise<string> => {
		const target = path.join(releasesRoot, release);
		await mkdir(path.join(target, IMMUTABLE_ASSETS, 'chunks'), { recursive: true });
		await writeFile(path.join(target, IMMUTABLE_ASSETS, 'chunks', `${release}.js`), 'export {};\n');
		await mkdir(path.join(target, 'node_modules'), { recursive: true });
		await writeFile(path.join(target, 'node_modules', 'bulk'), 'x'.repeat(64));
		stamp += 60_000;
		await utimes(target, new Date(stamp), new Date(stamp));
		return target;
	};

	return {
		root: base,
		releasesRoot,
		currentLink,
		ship,
		deploy: async (release, generations = ASSET_GENERATIONS) => {
			const target = await ship(release);
			await run(retainAssetsScript({ target, releasesRoot, generations }));
			await bash('ln', ['-sfnT', target, currentLink]);
			await run(pruneReleasesScript({ releasesRoot, currentLink, kept: KEPT, generations }));
		},
		chunks: async (release) =>
			(await readdir(path.join(releasesRoot, release, IMMUTABLE_ASSETS, 'chunks'))).sort(),
		exists: async (relative) =>
			access(path.join(base, relative))
				.then(() => true)
				.catch(() => false)
	};
}

describe('the assets a release serves after the one before it is replaced', () => {
	it('still include the previous release’s chunks, so a stale shell loads slowly rather than not at all', async () => {
		const fit = await machine();
		await fit.deploy('old');
		await fit.deploy('new');
		expect(await fit.chunks('new')).toEqual(['new.js', 'old.js']);
	});

	it('reach back exactly as many releases as are retained, and no further', async () => {
		const fit = await machine();
		for (const release of ['one', 'two', 'three']) await fit.deploy(release, 2);
		await fit.deploy('four', 2);
		// Two generations: `three` and `two` are served, `one` has aged out.
		expect(await fit.chunks('four')).toEqual(['four.js', 'three.js', 'two.js']);
	});

	it('are stored once, as links into the release that built them', async () => {
		const fit = await machine();
		await fit.deploy('old');
		await fit.deploy('new');
		const { stdout } = await bash('stat', [
			'-c',
			'%i',
			path.join(fit.releasesRoot, 'old', IMMUTABLE_ASSETS, 'chunks', 'old.js'),
			path.join(fit.releasesRoot, 'new', IMMUTABLE_ASSETS, 'chunks', 'old.js')
		]);
		const [older, carried] = stdout.trim().split('\n');
		expect(carried).toBe(older);
	});
});

describe('pruning old releases', () => {
	it('keeps the live release and the ones a rollback needs, whole', async () => {
		const fit = await machine();
		for (const release of ['a', 'b', 'c']) await fit.deploy(release);
		expect(await fit.exists(path.join('releases', 'a', 'node_modules', 'bulk'))).toBe(true);
	});

	it('takes everything but the assets off a release that has fallen out of that window', async () => {
		const fit = await machine();
		for (const release of ['a', 'b', 'c', 'd', 'e', 'f']) await fit.deploy(release);
		expect(await fit.exists(path.join('releases', 'a', 'node_modules'))).toBe(false);
		expect(await fit.exists(path.join('releases', 'a', RELEASE_ASSETS, 'chunks', 'a.js'))).toBe(
			true
		);
	});

	it('removes a release older than every asset still being served', async () => {
		const fit = await machine();
		const releases = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
		for (const release of releases) await fit.deploy(release);
		expect(await fit.exists(path.join('releases', 'a'))).toBe(false);
		expect((await readdir(fit.releasesRoot)).length).toBe(KEPT + ASSET_GENERATIONS);
	});
});
