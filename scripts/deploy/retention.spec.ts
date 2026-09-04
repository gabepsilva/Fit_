import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ASSET_GENERATIONS, IMMUTABLE_ASSETS, RELEASE_ASSETS, RELEASE_STAMP } from './retention';
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

const roots: string[] = [];

afterAll(async () => {
	await Promise.all(roots.map((directory) => rm(directory, { recursive: true, force: true })));
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
	/** The releases still holding everything a rollback would need. */
	whole: () => Promise<string[]>;
	exists: (relative: string) => Promise<boolean>;
};

async function machine(): Promise<Machine> {
	const base = await mkdtemp(path.join(os.tmpdir(), 'fit-retention-'));
	roots.push(base);
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
		whole: async () => {
			const kept: string[] = [];
			for (const release of (await readdir(releasesRoot)).sort()) {
				const present = await access(path.join(releasesRoot, release, 'node_modules')).then(
					() => true,
					() => false
				);
				if (present) kept.push(release);
			}
			return kept;
		},
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

/**
 * Enough deploys that the window is made entirely of releases pruning has
 * already been over. A dozen does not show a window that drifts; the damage
 * takes a few more deploys to reach the assets still being served.
 */
const SETTLED = Array.from({ length: 16 }, (_, index) => `r${String(index + 1).padStart(2, '0')}`);

describe('a machine that has been deploying for a while', () => {
	// Sixteen deploys is the cost of the question, so all three answers are
	// read off one machine rather than three identical ones.
	let fit: Machine;

	beforeAll(async () => {
		fit = await machine();
		for (const release of SETTLED) await fit.deploy(release);
	}, 60_000);

	it('serves an unbroken run of the most recent releases, with no release missing from the middle', async () => {
		// The window is only worth having if it is contiguous: a hole in it is a
		// shell of exactly that age that still gets 404s, and nothing about the
		// deploy would say which age that is.
		const newest = SETTLED.slice(-(ASSET_GENERATIONS + 1));
		expect(await fit.chunks(newest[newest.length - 1] ?? '')).toEqual(
			newest.map((release) => `${release}.js`).sort()
		);
	});

	it('still keeps the whole of as many releases as a rollback is promised', async () => {
		expect(await fit.whole()).toEqual(SETTLED.slice(-KEPT));
	});

	it('settles at a bounded number of release directories, oldest removed outright', async () => {
		expect(await fit.exists(path.join('releases', SETTLED[0] ?? ''))).toBe(false);
		expect((await readdir(fit.releasesRoot)).length).toBe(KEPT + ASSET_GENERATIONS);
	});

	it('leaves a stripped release able to say when it was deployed', async () => {
		// Its position in the order is the whole of what pruning must not
		// destroy: without it the next deploy reads a mtime pruning wrote.
		const stripped = SETTLED[SETTLED.length - KEPT - 1] ?? '';
		expect(await fit.exists(path.join('releases', stripped, RELEASE_STAMP))).toBe(true);
	});
});

describe('a machine deployed to before any of this existed', () => {
	it('orders the releases it finds by age, so the first deploy under it carries the right ones forward', async () => {
		// Nothing on the machine has a stamp, and nothing has been stripped
		// either, so the mtime it still has is the honest answer — once.
		const fit = await machine();
		for (const release of ['r01', 'r02', 'r03']) await fit.ship(release);
		await fit.deploy('r04', 2);
		expect(await fit.chunks('r04')).toEqual(['r02.js', 'r03.js', 'r04.js']);
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
});
