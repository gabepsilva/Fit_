import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import QuantityStepper from './QuantityStepper.svelte';

describe('QuantityStepper', () => {
	it('shows a whole number plainly', async () => {
		await render(QuantityStepper, { props: { value: 2 } });
		await expect.element(page.getByText('2', { exact: true })).toBeInTheDocument();
	});

	it('trims a fractional value to its shortest form', async () => {
		await render(QuantityStepper, { props: { value: 1.5 } });
		await expect.element(page.getByText('1.5', { exact: true })).toBeInTheDocument();
	});

	it('increases by the step', async () => {
		const props = $state({ value: 1, step: 0.5 });
		await render(QuantityStepper, { props });
		await page.getByRole('button', { name: 'Increase' }).click();
		expect(props.value).toBe(1.5);
	});

	it('decreases by the step', async () => {
		const props = $state({ value: 2, step: 0.5 });
		await render(QuantityStepper, { props });
		await page.getByRole('button', { name: 'Decrease' }).click();
		expect(props.value).toBe(1.5);
	});

	it('will not go below the minimum', async () => {
		const props = $state({ value: 0.5, step: 0.5, min: 0.25 });
		await render(QuantityStepper, { props });
		await page.getByRole('button', { name: 'Decrease' }).click();
		expect(props.value).toBe(0.25);
	});

	it('keeps quarter steps exact rather than drifting', async () => {
		const props = $state({ value: 0.25, step: 0.25 });
		await render(QuantityStepper, { props });
		await page.getByRole('button', { name: 'Increase' }).click();
		expect(props.value).toBe(0.5);
	});
});
