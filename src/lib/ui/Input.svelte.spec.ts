import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Input from './Input.svelte';

describe('Input', () => {
	it('shows its placeholder', async () => {
		await render(Input, { props: { placeholder: 'Search foods' } });
		await expect.element(page.getByPlaceholder('Search foods')).toBeInTheDocument();
	});

	it('renders the bound value', async () => {
		await render(Input, { props: { value: 'eggs', 'aria-label': 'Food' } });
		await expect.element(page.getByLabelText('Food')).toHaveValue('eggs');
	});

	it('writes typing back to the caller', async () => {
		const props = $state({ value: '', 'aria-label': 'Food' });
		await render(Input, { props });
		await page.getByLabelText('Food').fill('toast');
		expect(props.value).toBe('toast');
	});

	it('accepts a numeric value for number inputs', async () => {
		await render(Input, { props: { type: 'number', value: 34, 'aria-label': 'Age' } });
		await expect.element(page.getByLabelText('Age')).toHaveValue(34);
	});

	it('merges a caller-supplied class', async () => {
		await render(Input, { props: { class: 'pl-9', 'aria-label': 'Food' } });
		await expect.element(page.getByLabelText('Food')).toHaveClass(/pl-9/);
	});
});
