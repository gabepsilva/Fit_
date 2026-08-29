import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { DEFAULT_FORM_CUES, FORM_CUES } from '$lib/domain/exercise-catalog';
import FormCheckModal from './FormCheckModal.svelte';

const BENCH_CUES = FORM_CUES['Bench Press'] ?? [];

describe('FormCheckModal', () => {
	it('shows nothing until it is opened', async () => {
		await render(FormCheckModal, {
			props: { open: false, name: 'Bench Press', onclose: vi.fn() }
		});
		expect(document.body.textContent).not.toContain('Form check');
	});

	it('names the movement it is checking', async () => {
		await render(FormCheckModal, { props: { open: true, name: 'Squat', onclose: vi.fn() } });
		await expect.element(page.getByText('Squat')).toBeInTheDocument();
		await expect.element(page.getByText('Form check')).toBeInTheDocument();
	});

	it('gives the three written cues for a movement that has them', async () => {
		await render(FormCheckModal, {
			props: { open: true, name: 'Bench Press', onclose: vi.fn() }
		});
		expect(BENCH_CUES).toHaveLength(3);
		for (const cue of BENCH_CUES) {
			await expect.element(page.getByText(cue)).toBeInTheDocument();
		}
	});

	it('numbers the cues in the order they are to be read', async () => {
		await render(FormCheckModal, {
			props: { open: true, name: 'Bench Press', onclose: vi.fn() }
		});
		for (const n of ['1', '2', '3']) {
			await expect.element(page.getByText(n, { exact: true })).toBeInTheDocument();
		}
	});

	it('falls back to the general cues for a movement nothing was written for', async () => {
		await render(FormCheckModal, { props: { open: true, name: 'Shrug', onclose: vi.fn() } });
		for (const cue of DEFAULT_FORM_CUES) {
			await expect.element(page.getByText(cue)).toBeInTheDocument();
		}
		await expect.element(page.getByText(BENCH_CUES[0] ?? '')).not.toBeInTheDocument();
	});

	it('is honest that the demonstration is not there yet', async () => {
		await render(FormCheckModal, { props: { open: true, name: 'Squat', onclose: vi.fn() } });
		await expect.element(page.getByText('A demonstration clip belongs here')).toBeInTheDocument();
	});

	it('tells whoever opened it when it is done with', async () => {
		const onclose = vi.fn();
		await render(FormCheckModal, { props: { open: true, name: 'Squat', onclose } });
		await page.getByRole('button', { name: 'Got it' }).click();
		expect(onclose).toHaveBeenCalledTimes(1);
	});
});
