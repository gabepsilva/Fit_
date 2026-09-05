import { describe, expect, it } from 'vitest';
import { mutationSelfTestCanBreak } from './self-test-scope';

describe('mutationSelfTestCanBreak', () => {
	it('is false when nothing that drives the mutation self-test changed', () => {
		expect(
			mutationSelfTestCanBreak([
				'src/lib/server/users/session.ts',
				'README.md',
				'src/routes/+page.svelte'
			])
		).toBe(false);
	});

	it('is true for a change under scripts/quality/', () => {
		expect(mutationSelfTestCanBreak(['scripts/quality/gates.ts'])).toBe(true);
	});

	it('is true for a change under quality/', () => {
		expect(mutationSelfTestCanBreak(['quality/mutation-policy.json'])).toBe(true);
	});

	it('is true for a Stryker config file at the repo root', () => {
		expect(mutationSelfTestCanBreak(['stryker.config.mjs'])).toBe(true);
	});

	it('does not match a stryker config nested in a subdirectory', () => {
		expect(mutationSelfTestCanBreak(['some/nested/stryker.config.mjs'])).toBe(false);
	});

	it('is true for a change under .github/workflows/', () => {
		expect(mutationSelfTestCanBreak(['.github/workflows/ci.yml'])).toBe(true);
	});

	it('is true for package.json, bun.lock and .tool-versions at the repo root', () => {
		expect(mutationSelfTestCanBreak(['package.json'])).toBe(true);
		expect(mutationSelfTestCanBreak(['bun.lock'])).toBe(true);
		expect(mutationSelfTestCanBreak(['.tool-versions'])).toBe(true);
	});

	it('does not match package.json nested in a subdirectory', () => {
		expect(mutationSelfTestCanBreak(['some/nested/package.json'])).toBe(false);
	});

	it('is false for an empty diff', () => {
		expect(mutationSelfTestCanBreak([])).toBe(false);
	});
});
