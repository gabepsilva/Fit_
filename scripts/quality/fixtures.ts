import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Deliberately broken inputs, one per gate, proving each gate catches what it
 * claims. Fixtures are generated at run time rather than committed: a stored
 * fixture for the secret scanner would trip the secret scanner on this
 * repository, and the same is true of the spell checker and the linters.
 * Fragments are joined so the offending literal never appears in the source.
 */

export interface GateFixture {
	name: string;
	/** The gate expected to fail. */
	gate: string;
	/** Gates that must pass first, in order. */
	prepare?: string[];
	description: string;
	docker?: boolean;
	browser?: boolean;
	apply: (root: string) => Promise<void>;
}

async function write(root: string, relativePath: string, content: string): Promise<void> {
	const target = path.join(root, relativePath);
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, content);
}

async function edit(
	root: string,
	relativePath: string,
	change: (content: string) => string
): Promise<void> {
	const target = path.join(root, relativePath);
	await writeFile(target, change(await readFile(target, 'utf8')));
}

const duplicatedBlock = `export function normalize(values: number[], factor: number): number[] {
	const result: number[] = [];
	for (const value of values) {
		if (value > factor) {
			result.push(value * factor);
		} else if (value < -factor) {
			result.push(value / factor);
		} else {
			result.push(0);
		}
	}
	if (result.length === 0) {
		result.push(factor);
	}
	return result;
}
`;

export const fixtures: GateFixture[] = [
	{
		name: 'unformatted-source',
		gate: 'format:check',
		description: 'A source file that Prettier would reformat.',
		apply: (root) => write(root, 'src/lib/fixture.ts', 'export const value   =    1\n')
	},
	{
		name: 'explicit-any',
		gate: 'lint',
		description: 'An explicit any, which the type-aware ESLint config rejects.',
		apply: (root) =>
			write(
				root,
				'src/lib/fixture.ts',
				'export function identity(value: any) {\n\treturn value;\n}\n'
			)
	},
	{
		name: 'markdown-violation',
		gate: 'lint:docs',
		description: 'A Markdown file with a missing top-level heading and a hard tab.',
		apply: (root) => write(root, 'fixture.md', '##\tSkipped level\n\ntext\n')
	},
	{
		name: 'unknown-word',
		gate: 'spellcheck',
		description: 'A word no dictionary contains.',
		// Three-character fragments stay under the spell checker's minimum word length.
		apply: (root) =>
			write(root, 'src/lib/fixture.ts', `export const ${['zqf', 'lub', 'tyx'].join('')} = 1;\n`)
	},
	{
		name: 'type-error',
		gate: 'check',
		description: 'A type error in application source.',
		apply: (root) => write(root, 'src/lib/fixture.ts', "export const count: number = 'text';\n")
	},
	{
		name: 'script-type-error',
		gate: 'check:scripts',
		description: 'A type error in the scripts project.',
		apply: (root) => write(root, 'scripts/fixture.ts', "export const count: number = 'text';\n")
	},
	{
		name: 'unjustified-suppression',
		gate: 'check:suppressions',
		description: 'A suppression comment with no issue key or URL.',
		apply: (root) =>
			write(root, 'src/lib/fixture.ts', `/* eslint-${'disable'} */\nexport const value = 1;\n`)
	},
	{
		name: 'weakened-threshold',
		gate: 'check:thresholds',
		description: 'A coverage threshold lowered below the recorded baseline.',
		apply: (root) =>
			edit(root, 'quality/thresholds.json', (content) =>
				content.replace('"lines": 80', '"lines": 50')
			)
	},
	{
		name: 'unused-file',
		gate: 'knip',
		description: 'A file nothing imports.',
		apply: (root) => write(root, 'src/lib/fixture.ts', 'export const unused = 1;\n')
	},
	{
		name: 'duplicated-block',
		gate: 'duplicates',
		description: 'The same block of logic in two files.',
		apply: async (root) => {
			await write(root, 'src/lib/fixture-a.ts', duplicatedBlock);
			await write(root, 'src/lib/fixture-b.ts', `${duplicatedBlock}export const tag = 'b';\n`);
		}
	},
	{
		name: 'invalid-workflow',
		gate: 'check:workflows',
		docker: true,
		description: 'A GitHub Actions workflow with an unknown runner and a bad expression.',
		apply: (root) =>
			write(
				root,
				'.github/workflows/fixture.yml',
				'name: Fixture\non: push\njobs:\n  broken:\n    runs-on: ubuntu-00.00\n    steps:\n      - run: echo "${{ github.no_such_context }}"\n'
			)
	},
	{
		name: 'oversized-bundle',
		gate: 'check:bundle',
		prepare: ['build'],
		description: 'A client module far larger than the byte budget.',
		apply: async (root) => {
			const payload = 'fit-bundle-budget-fixture-payload-'.repeat(8000);
			await write(root, 'src/lib/fixture.ts', `export const payload = '${payload}';\n`);
			// A route of its own, rather than an edit to an existing page: the
			// payload still lands in the client build and counts against the
			// budget, and the fixture cannot be broken by whatever a real page
			// happens to contain.
			await write(
				root,
				'src/routes/fixture/+page.svelte',
				`<script lang="ts">\n\timport { payload } from '$lib/fixture';\n</script>\n\n<p>{payload.length}</p>\n`
			);
		}
	},
	{
		name: 'uncovered-file',
		gate: 'test:coverage',
		browser: true,
		description: 'An untested module, which per-file coverage thresholds must catch.',
		apply: (root) =>
			write(
				root,
				'src/lib/fixture.ts',
				'export function classify(value: number): string {\n\tif (value > 10) return "high";\n\tif (value > 5) return "medium";\n\treturn "low";\n}\n'
			)
	},
	{
		name: 'surviving-mutant',
		gate: 'test:mutation',
		browser: true,
		description: 'A test that asserts nothing the code actually does, so mutants survive.',
		apply: async (root) => {
			await write(
				root,
				'src/lib/fixture.ts',
				'export function add(a: number, b: number): number {\n\treturn a + b;\n}\n'
			);
			await write(
				root,
				'src/lib/fixture.spec.ts',
				"import { describe, expect, it } from 'vitest';\nimport { add } from './fixture';\n\ndescribe('add', () => {\n\tit('exists', () => {\n\t\texpect(typeof add).toBe('function');\n\t});\n});\n"
			);
		}
	},
	{
		name: 'broken-component',
		gate: 'build',
		description: 'A Svelte component that cannot compile.',
		apply: (root) =>
			write(
				root,
				'src/routes/fixture/+page.svelte',
				'<script lang="ts">\n\tconst value = ;\n</script>\n'
			)
	},
	{
		name: 'committed-secret',
		gate: 'security:gitleaks',
		docker: true,
		description: 'A credential in the working tree.',
		apply: (root) =>
			// Assembled at run time so this repository never contains the pattern.
			write(
				root,
				'src/lib/fixture.ts',
				`export const key = '${['AKI', 'AQ3', 'T7X', '2LM', 'NBV', 'CZX', 'R4T'].join('')}';\n`
			)
	},
	{
		name: 'dynamic-code-execution',
		gate: 'security:semgrep',
		docker: true,
		description: 'Dynamic code execution, which the project Semgrep rules reject.',
		apply: (root) =>
			write(
				root,
				'src/lib/fixture.ts',
				'export function run(source: string): unknown {\n\treturn eval(source);\n}\n'
			)
	},
	{
		name: 'missing-heading',
		gate: 'test:e2e',
		browser: true,
		description: 'A page whose heading the end-to-end flow asserts on.',
		apply: (root) => write(root, 'src/routes/progress/+page.svelte', '<p>no heading here</p>\n')
	}
];
