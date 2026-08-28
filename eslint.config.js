import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import playwright from 'eslint-plugin-playwright';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	// The generated native project holds a copy of the built web assets, which
	// are minified and not ours to lint. `android/.gitignore` hides them from
	// git, but `includeIgnoreFile` above only reads the root one.
	{ ignores: ['android/**'] },
	js.configs.recommended,
	ts.configs.recommendedTypeChecked,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		linterOptions: {
			reportUnusedDisableDirectives: 'error',
			reportUnusedInlineConfigs: 'error'
		},
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			// `capacitor.config.ts` is read by the Capacitor CLI rather than by
			// the app, so no tsconfig owns it; it still gets type-aware linting.
			parserOptions: {
				projectService: { allowDefaultProject: ['capacitor.config.ts'] }
			}
		},
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-non-null-assertion': 'error',
			'@typescript-eslint/switch-exhaustiveness-check': 'error',
			'svelte/button-has-type': 'error',
			'svelte/no-target-blank': 'error'
		}
	},
	{
		files: ['**/*.{js,mjs}', 'playwright.config.ts'],
		...ts.configs.disableTypeChecked
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		files: ['src/**/*.{js,ts,svelte}'],
		ignores: ['src/**/*.{test,spec}.{js,ts}', 'src/**/*.svelte.{test,spec}.{js,ts}'],
		rules: {
			complexity: ['error', 10],
			'max-depth': ['error', 4],
			'max-params': ['error', 4]
		}
	},
	{
		files: ['src/**/*.{test,spec}.{js,ts}', 'src/**/*.svelte.{test,spec}.{js,ts}'],
		...vitest.configs.recommended,
		rules: {
			...vitest.configs.recommended.rules,
			'vitest/no-commented-out-tests': 'error',
			'vitest/no-disabled-tests': 'error',
			'vitest/no-focused-tests': 'error',
			'vitest/warn-todo': 'error'
		}
	},
	{
		files: ['**/*.e2e.{js,ts}'],
		...playwright.configs['flat/recommended'],
		rules: {
			...playwright.configs['flat/recommended'].rules,
			'playwright/no-focused-test': 'error',
			'playwright/no-skipped-test': 'error'
		}
	}
);
