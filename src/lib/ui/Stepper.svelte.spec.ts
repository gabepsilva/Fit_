import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Stepper from './Stepper.svelte';

describe('Stepper', () => {
	it('shows the reading it was given', async () => {
		await render(Stepper, { props: { value: 8, label: 'reps', onstep: vi.fn() } });
		await expect.element(page.getByText('8', { exact: true })).toBeInTheDocument();
	});

	it('shows a reading that is not a number, such as a bodyweight dash', async () => {
		await render(Stepper, { props: { value: '—', label: 'load', onstep: vi.fn() } });
		await expect.element(page.getByText('—', { exact: true })).toBeInTheDocument();
	});

	it('names both controls after the thing they adjust', async () => {
		await render(Stepper, { props: { value: 8, label: 'reps', onstep: vi.fn() } });
		await expect.element(page.getByRole('button', { name: 'Decrease reps' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Increase reps' })).toBeInTheDocument();
	});

	it('reports upwards when the plus is used', async () => {
		const onstep = vi.fn();
		await render(Stepper, { props: { value: 40, label: 'load', onstep } });
		await page.getByRole('button', { name: 'Increase load' }).click();
		expect(onstep).toHaveBeenCalledWith(1);
	});

	it('reports downwards when the minus is used', async () => {
		const onstep = vi.fn();
		await render(Stepper, { props: { value: 40, label: 'load', onstep } });
		await page.getByRole('button', { name: 'Decrease load' }).click();
		expect(onstep).toHaveBeenCalledWith(-1);
	});

	it('leaves the value alone, because the caller owns it', async () => {
		const onstep = vi.fn();
		await render(Stepper, { props: { value: 40, label: 'load', onstep } });
		await page.getByRole('button', { name: 'Increase load' }).click();
		await expect.element(page.getByText('40', { exact: true })).toBeInTheDocument();
		expect(onstep).toHaveBeenCalledTimes(1);
	});

	it('names its controls after nothing in particular when it adjusts the only number in view', async () => {
		await render(Stepper, { props: { value: 2, onstep: vi.fn() } });
		await expect.element(page.getByRole('button', { name: 'Decrease' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Increase' })).toBeInTheDocument();
	});

	it('stands alone at the larger size, beside controls of the same height', async () => {
		await render(Stepper, { props: { value: 2, size: 'md', onstep: vi.fn() } });
		expect(document.querySelectorAll('button.size-10')).toHaveLength(2);
	});

	it('sits inside a row at the smaller size', async () => {
		await render(Stepper, { props: { value: 2, label: 'reps', onstep: vi.fn() } });
		expect(document.querySelectorAll('button.size-8')).toHaveLength(2);
	});

	it('takes an extra class from whoever placed it', async () => {
		await render(Stepper, {
			props: { value: 8, label: 'reps', onstep: vi.fn(), class: 'ml-auto' }
		});
		expect(document.querySelectorAll('.ml-auto')).toHaveLength(1);
	});
});
