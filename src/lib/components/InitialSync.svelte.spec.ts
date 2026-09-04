import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import InitialSync from './InitialSync.svelte';

const base = { onretry: vi.fn(), oncontinue: vi.fn() };

describe('InitialSync', () => {
	it('tells a person their data is on its way, rather than showing nothing', async () => {
		await render(InitialSync, { props: { ...base } });
		await expect.element(page.getByText('Loading your data…')).toBeInTheDocument();
	});

	it('announces itself to assistive tech as a status, not silently', async () => {
		await render(InitialSync, { props: { ...base } });
		await expect.element(page.getByRole('status')).toBeInTheDocument();
	});

	it('offers no way out yet on a pull that has barely begun', async () => {
		vi.useFakeTimers();
		await render(InitialSync, { props: { ...base } });
		await vi.advanceTimersByTimeAsync(1000);
		expect(page.getByRole('button', { name: 'Try again' }).elements()).toHaveLength(0);
		vi.useRealTimers();
	});

	it('offers a retry and a way to continue once it has taken too long', async () => {
		vi.useFakeTimers();
		await render(InitialSync, { props: { ...base } });
		await vi.advanceTimersByTimeAsync(6000);
		await expect.element(page.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Continue without waiting' }))
			.toBeInTheDocument();
		vi.useRealTimers();
	});

	it('raises the retry action rather than trying again on its own', async () => {
		vi.useFakeTimers();
		const onretry = vi.fn();
		await render(InitialSync, { props: { ...base, onretry } });
		await vi.advanceTimersByTimeAsync(6000);
		vi.useRealTimers();
		await page.getByRole('button', { name: 'Try again' }).click();
		expect(onretry).toHaveBeenCalled();
	});

	it('raises the continue action, so a stuck pull is never a dead end', async () => {
		vi.useFakeTimers();
		const oncontinue = vi.fn();
		await render(InitialSync, { props: { ...base, oncontinue } });
		await vi.advanceTimersByTimeAsync(6000);
		vi.useRealTimers();
		await page.getByRole('button', { name: 'Continue without waiting' }).click();
		expect(oncontinue).toHaveBeenCalled();
	});
});
