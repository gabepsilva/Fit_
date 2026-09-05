import { describe, expect, it } from 'vitest';
import { logFileName } from './verify-changed';

describe('logFileName', () => {
	it('stays short even for a diff that touches many spec files (#141)', () => {
		const files = Array.from(
			{ length: 40 },
			(_, index) => `src/lib/components/widget-${index}.spec.ts`
		);
		const name = logFileName('specs', files);
		expect(name.length).toBeLessThan(100);
	});

	it('is stable across runs for the same file list', () => {
		const files = Array.from(
			{ length: 40 },
			(_, index) => `src/lib/components/widget-${index}.spec.ts`
		);
		expect(logFileName('specs', files)).toBe(logFileName('specs', files));
	});

	it('names the log after the step, not the file list', () => {
		const files = ['src/lib/a.spec.ts', 'src/lib/b.spec.ts'];
		expect(logFileName('specs', files)).toMatch(/^specs-[0-9a-f]{8}$/);
	});

	it('differs when the file list differs', () => {
		const a = logFileName('specs', ['src/lib/a.spec.ts']);
		const b = logFileName('specs', ['src/lib/b.spec.ts']);
		expect(a).not.toBe(b);
	});
});
