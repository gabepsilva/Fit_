import path from 'node:path';
// Extensions are explicit for the reason `scripts/eval/search-eval.ts` gives:
// this module runs under plain Node (via `node scripts/perf/measure.ts`),
// which does not resolve a specifier that omits its extension the way Vite
// does.
import { run } from '../security/shared.ts';
import { collectAssets, measure } from '../quality/bundle-assets.ts';
import type { Asset, Measurement } from '../quality/bundle-assets.ts';

/**
 * Instrument 1: the client bundle, measured through the same
 * `collectAssets`/`measure` pair `bundle-headroom.ts` and the `check:bundle`
 * gate already use, so this can never disagree with them about what "the
 * build" means.
 */

export interface BundleMetrics {
	javascriptBytes: number;
	cssBytes: number;
	largestAsset: Asset;
}

/** Pure: the three numbers this instrument reports, out of a full measurement. */
export function bundleMetrics(measurement: Measurement): BundleMetrics {
	return {
		javascriptBytes: measurement.javascriptBytes,
		cssBytes: measurement.cssBytes,
		largestAsset: measurement.largestAsset
	};
}

/** Pure: renders `BundleMetrics` as the report's per-metric lines. */
export function formatBundleMetrics(metrics: BundleMetrics): string[] {
	return [
		`- JS: ${metrics.javascriptBytes} bytes`,
		`- CSS: ${metrics.cssBytes} bytes`,
		`- Largest asset: ${metrics.largestAsset.file || '(none)'} (${metrics.largestAsset.bytes} bytes)`
	];
}

const assetRootSegments = ['.svelte-kit', 'output', 'client', '_app', 'immutable'];

/**
 * Builds the tree at `root` (`bun run build`, nothing more — the same command
 * `check:bundle` and `bundle-headroom` run) and measures the client bundle it
 * emits.
 */
export async function measureBundle(root: string): Promise<BundleMetrics> {
	const exitCode = await run('bun', ['run', 'build'], { cwd: root, allowFailure: true });
	if (exitCode !== 0) throw new Error(`Production build failed in ${root} (exit ${exitCode}).`);
	const assetRoot = path.join(root, ...assetRootSegments);
	const assets = await collectAssets(assetRoot, assetRoot);
	return bundleMetrics(measure(assets));
}
