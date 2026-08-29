import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import EmptyState from './EmptyState.svelte';

const children = createRawSnippet(() => ({
	render: () => '<span>Start one from a routine and it will pick up here.</span>'
}));

const action = createRawSnippet(() => ({
	render: () => '<a href="/exercise">Back to Exercise</a>'
}));

describe('EmptyState', () => {
	it('says what is missing', async () => {
		await render(EmptyState, { props: { children } });
		await expect
			.element(page.getByText('Start one from a routine and it will pick up here.'))
			.toBeInTheDocument();
	});

	it('carries the page heading for a screen that has nothing else to head it', async () => {
		await render(EmptyState, { props: { title: 'No session running', children } });
		await expect
			.element(page.getByRole('heading', { name: 'No session running', level: 1 }))
			.toBeInTheDocument();
	});

	it('heads nothing where the screen already names itself', async () => {
		await render(EmptyState, { props: { children } });
		expect(document.querySelectorAll('h1')).toHaveLength(0);
	});

	it('offers the way out it was given', async () => {
		await render(EmptyState, { props: { title: 'Nothing filed yet', children, action } });
		await expect.element(page.getByRole('link', { name: 'Back to Exercise' })).toBeInTheDocument();
	});

	it('leaves the card bare when there is nowhere in particular to go', async () => {
		await render(EmptyState, { props: { children } });
		expect(document.querySelectorAll('a')).toHaveLength(0);
	});
});
