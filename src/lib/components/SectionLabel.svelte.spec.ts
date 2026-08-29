import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import SectionLabel from './SectionLabel.svelte';

const children = createRawSnippet(() => ({ render: () => '<span>Days a week</span>' }));

describe('SectionLabel', () => {
	it('names the block under it', async () => {
		await render(SectionLabel, { props: { children } });
		await expect.element(page.getByText('Days a week')).toBeInTheDocument();
	});

	it('is drawn the one way, whoever asks for it', async () => {
		await render(SectionLabel, { props: { children } });
		const className = document.querySelector('p')?.className ?? '';
		expect(className).toContain('text-[0.65rem]');
		expect(className).toContain('tracking-[0.14em]');
	});

	it('takes the spacing of wherever it was placed', async () => {
		await render(SectionLabel, { props: { class: 'mb-2', children } });
		expect(document.querySelector('p')?.className).toContain('mb-2');
	});
});
