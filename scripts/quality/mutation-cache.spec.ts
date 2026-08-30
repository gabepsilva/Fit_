import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
	mutationCompatibilityDigest,
	prepareMutationCache,
	recordMutationCache
} from './mutation-cache';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('mutation cache', () => {
	it('keeps only a cache recorded under the exact lane compatibility digest', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'fit-mutation-cache-'));
		roots.push(root);
		const incrementalPath = path.join(root, 'incremental.json');
		const metadataPath = path.join(root, 'cache.json');
		await writeFile(incrementalPath, '{}\n');
		await writeFile(metadataPath, '{"digest":"wrong"}\n');
		const digest = await prepareMutationCache({
			projectRoot,
			lane: 'security',
			incrementalPath,
			metadataPath
		});
		await expect(readFile(incrementalPath, 'utf8')).rejects.toThrow();
		await writeFile(incrementalPath, '{}\n');
		await recordMutationCache(metadataPath, digest);
		expect(
			await prepareMutationCache({
				projectRoot,
				lane: 'security',
				incrementalPath,
				metadataPath
			})
		).toBe(await mutationCompatibilityDigest(projectRoot, 'security'));
		expect(await readFile(incrementalPath, 'utf8')).toBe('{}\n');
		await expect(readFile(metadataPath, 'utf8')).rejects.toThrow();

		// Model an abrupt kill after Stryker started rewriting its state. The
		// consumed marker makes the next process discard that partial file.
		await writeFile(incrementalPath, '{"partial":true}\n');
		await prepareMutationCache({
			projectRoot,
			lane: 'security',
			incrementalPath,
			metadataPath
		});
		await expect(readFile(incrementalPath, 'utf8')).rejects.toThrow();
	});
});
