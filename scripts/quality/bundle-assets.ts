import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Shared by `bundle-budget.ts` (the `check:bundle` gate) and
 * `bundle-headroom.ts` (`bun run bundle:headroom`), so the two ways this repo
 * measures the client bundle can never quietly disagree about which files
 * count or how their size is read.
 */

export interface Asset {
	bytes: number;
	file: string;
}

export interface Measurement {
	assets: Asset[];
	javascriptBytes: number;
	cssBytes: number;
	largestAsset: Asset;
}

const EMPTY_ASSET: Asset = { file: '', bytes: 0 };

/** Pure: turns a flat asset list into the three numbers the budgets police. */
export function measure(assets: Asset[]): Measurement {
	const javascriptBytes = assets
		.filter(({ file }) => file.endsWith('.js'))
		.reduce((total, { bytes }) => total + bytes, 0);
	const cssBytes = assets
		.filter(({ file }) => file.endsWith('.css'))
		.reduce((total, { bytes }) => total + bytes, 0);
	const largestAsset = assets.reduce<Asset>(
		(largest, asset) => (asset.bytes > largest.bytes ? asset : largest),
		EMPTY_ASSET
	);
	return { assets, javascriptBytes, cssBytes, largestAsset };
}

/**
 * Recursively collects every CSS/JS file under `directory`. `file` is
 * expressed relative to `relativeTo` — the project root for a report meant to
 * be read on its own, or `directory` itself when the caller needs a path
 * that is comparable across two different builds of the same tree.
 */
export async function collectAssets(directory: string, relativeTo: string): Promise<Asset[]> {
	const assets: Asset[] = [];
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch {
		return assets;
	}
	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			assets.push(...(await collectAssets(entryPath, relativeTo)));
		} else if (entry.isFile() && /\.(?:css|js)$/.test(entry.name)) {
			assets.push({
				bytes: (await stat(entryPath)).size,
				file: path.relative(relativeTo, entryPath).split(path.sep).join('/')
			});
		}
	}
	return assets;
}
