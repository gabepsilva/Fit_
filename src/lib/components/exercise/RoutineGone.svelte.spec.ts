import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import RoutineGone from './RoutineGone.svelte';

describe('RoutineGone', () => {
	it('says the routine is not there rather than showing an empty screen', async () => {
		await render(RoutineGone, { props: { title: 'Routine' } });
		await expect.element(page.getByText('That routine is gone.')).toBeInTheDocument();
	});

	it('keeps the name of the screen that was asked for', async () => {
		await render(RoutineGone, { props: { title: 'Edit routine' } });
		await expect.element(page.getByText('Edit routine')).toBeInTheDocument();
	});

	it('leads back to the rotation', async () => {
		await render(RoutineGone, { props: { title: 'Routine' } });
		await expect
			.element(page.getByRole('link', { name: 'Back to Exercise' }).last())
			.toHaveAttribute('href', '/exercise');
	});
});
