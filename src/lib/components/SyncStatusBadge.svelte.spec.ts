import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { sync } from '$lib/state/sync.svelte';
import SyncStatusBadge from './SyncStatusBadge.svelte';

afterEach(() => {
	// `sync` is a module singleton; leaving it in a non-idle status would leak
	// into whichever test runs next.
	sync.status = 'idle';
	vi.useRealTimers();
});

describe('SyncStatusBadge, quiet by default', () => {
	it('says nothing while idle', async () => {
		sync.status = 'idle';
		await render(SyncStatusBadge);
		expect(document.body.textContent?.trim()).toBe('');
	});

	it('says nothing about a save that has not run long enough to notice', async () => {
		vi.useFakeTimers();
		sync.status = 'saving';
		await render(SyncStatusBadge);
		await vi.advanceTimersByTimeAsync(200);
		expect(document.body.textContent?.trim()).toBe('');
	});

	it('says nothing about a background read that resolves quickly', async () => {
		vi.useFakeTimers();
		sync.status = 'loading';
		await render(SyncStatusBadge);
		await vi.advanceTimersByTimeAsync(200);
		expect(document.body.textContent?.trim()).toBe('');
	});
});

describe('SyncStatusBadge, a write not yet on the server', () => {
	it('admits a save is still open once it has run long enough to notice', async () => {
		vi.useFakeTimers();
		sync.status = 'saving';
		await render(SyncStatusBadge);
		await vi.advanceTimersByTimeAsync(500);
		expect(document.body.textContent).toContain('Saving…');
	});

	it('clears the notice once the save settles', async () => {
		vi.useFakeTimers();
		sync.status = 'saving';
		await render(SyncStatusBadge);
		await vi.advanceTimersByTimeAsync(500);
		expect(document.body.textContent).toContain('Saving…');

		sync.status = 'idle';
		await vi.advanceTimersByTimeAsync(500);
		expect(document.body.textContent?.trim()).toBe('');
	});
});

describe('SyncStatusBadge, offline with unsent changes', () => {
	it('is distinguishable from a save in flight', async () => {
		sync.status = 'waiting';
		await render(SyncStatusBadge);
		await expect.element(page.getByText(/offline/i)).toBeInTheDocument();
		expect(document.body.textContent).not.toContain('Saving…');
	});

	it('shows immediately, with no delay to let a person miss it', async () => {
		vi.useFakeTimers();
		sync.status = 'waiting';
		await render(SyncStatusBadge);
		expect(document.body.textContent).toContain('Offline');
	});
});

describe('SyncStatusBadge, a write the server refused', () => {
	it('says the save failed rather than staying silent', async () => {
		sync.status = 'error';
		await render(SyncStatusBadge);
		await expect.element(page.getByText(/couldn't reach the server/i)).toBeInTheDocument();
	});
});
