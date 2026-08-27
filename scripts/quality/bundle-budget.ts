import { readdir, readFile, stat, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

interface BundleBudgets {
	clientCssBytes: number;
	clientJavaScriptBytes: number;
	largestAssetBytes: number;
}

interface Asset {
	bytes: number;
	file: string;
}

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const assetRoot = path.join(projectRoot, '.svelte-kit', 'output', 'client', '_app', 'immutable');
const reportDirectory = path.join(projectRoot, 'reports', 'quality', 'bundle');
const budgets = JSON.parse(
	await readFile(path.join(projectRoot, 'quality', 'bundle-budgets.json'), 'utf8')
) as BundleBudgets;

async function collectAssets(directory: string): Promise<Asset[]> {
	const assets: Asset[] = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			assets.push(...(await collectAssets(entryPath)));
		} else if (entry.isFile() && /\.(?:css|js)$/.test(entry.name)) {
			assets.push({
				bytes: (await stat(entryPath)).size,
				file: path.relative(projectRoot, entryPath)
			});
		}
	}
	return assets;
}

const assets = await collectAssets(assetRoot);
const javascriptBytes = assets
	.filter(({ file }) => file.endsWith('.js'))
	.reduce((total, { bytes }) => total + bytes, 0);
const cssBytes = assets
	.filter(({ file }) => file.endsWith('.css'))
	.reduce((total, { bytes }) => total + bytes, 0);
const largestAsset = assets.reduce<Asset>(
	(largest, asset) => (asset.bytes > largest.bytes ? asset : largest),
	{ bytes: 0, file: '' }
);
const violations = [
	javascriptBytes > budgets.clientJavaScriptBytes
		? `Client JavaScript is ${javascriptBytes} bytes; budget is ${budgets.clientJavaScriptBytes}.`
		: undefined,
	cssBytes > budgets.clientCssBytes
		? `Client CSS is ${cssBytes} bytes; budget is ${budgets.clientCssBytes}.`
		: undefined,
	largestAsset.bytes > budgets.largestAssetBytes
		? `Largest asset ${largestAsset.file} is ${largestAsset.bytes} bytes; budget is ${budgets.largestAssetBytes}.`
		: undefined
].filter((violation): violation is string => violation !== undefined);

await rm(reportDirectory, { recursive: true, force: true });
await mkdir(reportDirectory, { recursive: true });
await writeFile(
	path.join(reportDirectory, 'bundle-budget.json'),
	`${JSON.stringify({ assets, budgets, cssBytes, javascriptBytes, largestAsset, violations }, null, 2)}\n`
);

console.log(
	`Bundle: ${javascriptBytes} JS bytes, ${cssBytes} CSS bytes, ${largestAsset.bytes} largest asset bytes.`
);
if (violations.length > 0) throw new Error(violations.join('\n'));
