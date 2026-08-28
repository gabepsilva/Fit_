import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Textarea from './Textarea.svelte';

describe('Textarea', () => {
	it('shows its placeholder', async () => {
		await render(Textarea, { props: { placeholder: 'two eggs, toast' } });
		await expect.element(page.getByPlaceholder('two eggs, toast')).toBeInTheDocument();
	});

	it('renders the bound value', async () => {
		await render(Textarea, { props: { value: 'oatmeal', 'aria-label': 'Meal' } });
		await expect.element(page.getByLabelText('Meal')).toHaveValue('oatmeal');
	});

	it('writes typing back to the caller', async () => {
		const props = $state({ value: '', 'aria-label': 'Meal' });
		await render(Textarea, { props });
		await page.getByLabelText('Meal').fill('two eggs');
		expect(props.value).toBe('two eggs');
	});

	it('honours a row count', async () => {
		await render(Textarea, { props: { rows: 3, 'aria-label': 'Meal' } });
		await expect.element(page.getByLabelText('Meal')).toHaveAttribute('rows', '3');
	});

	it('merges a caller-supplied class', async () => {
		await render(Textarea, { props: { class: 'mt-3', 'aria-label': 'Meal' } });
		await expect.element(page.getByLabelText('Meal')).toHaveClass(/mt-3/);
	});
});
