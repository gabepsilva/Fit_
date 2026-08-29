import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ScreenHeader from './ScreenHeader.svelte';

/** Stands in for the one action a screen puts at the end of its header row. */
const action = createRawSnippet(() => ({
	render: () => '<button type="button">Save</button>'
}));

describe('ScreenHeader', () => {
	it('shows where you are', async () => {
		await render(ScreenHeader, { props: { back: '/exercise', title: 'Routine builder' } });
		await expect.element(page.getByText('Routine builder')).toBeInTheDocument();
	});

	it('leads back to where it was told to', async () => {
		await render(ScreenHeader, { props: { back: '/exercise/plan', title: 'Year' } });
		await expect
			.element(page.getByRole('link', { name: 'Back' }))
			.toHaveAttribute('href', '/exercise/plan');
	});

	it('names the way back plainly when nobody said what it leads to', async () => {
		await render(ScreenHeader, { props: { back: '/exercise', title: 'Session' } });
		await expect.element(page.getByRole('link', { name: 'Back' })).toBeInTheDocument();
	});

	it('takes a more particular name for the way back', async () => {
		await render(ScreenHeader, {
			props: { back: '/exercise', title: 'Session', backLabel: 'Back to Exercise' }
		});
		await expect.element(page.getByRole('link', { name: 'Back to Exercise' })).toBeInTheDocument();
	});

	it('shows the screen’s own action beside the title', async () => {
		await render(ScreenHeader, { props: { back: '/exercise', title: 'Routine', action } });
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeInTheDocument();
	});

	it('carries nothing but the way back when a screen has no action', async () => {
		await render(ScreenHeader, { props: { back: '/exercise', title: 'Routine' } });
		expect(document.querySelectorAll('button')).toHaveLength(0);
	});
});
