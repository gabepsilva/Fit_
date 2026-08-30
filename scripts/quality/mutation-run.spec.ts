import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resetMutationResultArtifacts } from './mutation-run';

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('mutation result reset', () => {
	it('clears every prior verdict artifact before a run can return early', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'fit-mutation-results-'));
		roots.push(directory);
		await Promise.all(
			['scope.json', 'mutation.json', 'verdict.json'].map((file) =>
				writeFile(path.join(directory, file), '{"ok":true}\n')
			)
		);
		await resetMutationResultArtifacts(directory);
		for (const file of ['scope.json', 'mutation.json', 'verdict.json']) {
			await expect(access(path.join(directory, file))).rejects.toThrow();
		}
	});
});
