import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import LabelHarness from './LabelHarness.svelte';

describe('Label', () => {
	it('renders its text', async () => {
		await render(LabelHarness, { props: { text: 'Weight kg', for: 'kg' } });
		await expect.element(page.getByText('Weight kg')).toBeInTheDocument();
	});

	it('associates itself with the field it names', async () => {
		await render(LabelHarness, { props: { text: 'Weight kg', for: 'kg' } });
		expect(document.querySelector('label')?.getAttribute('for')).toBe('kg');
	});

	it('merges a caller-supplied class', async () => {
		await render(LabelHarness, { props: { text: 'Weight kg', for: 'kg', class: 'mt-2' } });
		expect(document.querySelector('label')?.className).toMatch(/mt-2/);
	});
});
