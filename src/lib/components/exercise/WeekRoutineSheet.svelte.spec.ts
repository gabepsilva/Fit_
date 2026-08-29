import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { CalendarWeek } from '$lib/domain/training-plan';
import { REST_WEEK, type Routine } from '$lib/domain/types';
import { planOptions } from './plan-options';
import WeekRoutineSheet from './WeekRoutineSheet.svelte';

function routine(id: string, name: string, freq = 3): Routine {
	return { id, name, freq, exercises: [] };
}

const OPTIONS = planOptions([routine('push', 'Chest & Shoulders')]);

const WEEK: CalendarWeek = {
	week: 34,
	month: 7,
	startISO: '2026-08-17',
	endISO: '2026-08-23',
	label: 'Aug 17–23'
};

function props(overrides: Record<string, unknown> = {}) {
	return {
		open: true,
		week: WEEK,
		year: 2026,
		options: OPTIONS,
		onpick: vi.fn(),
		onclose: vi.fn(),
		...overrides
	};
}

describe('WeekRoutineSheet', () => {
	it('names the week and when it falls', async () => {
		await render(WeekRoutineSheet, { props: props() });
		await expect.element(page.getByText('Week 34')).toBeInTheDocument();
		await expect.element(page.getByText('Aug 17–23 · 2026')).toBeInTheDocument();
	});

	it('offers every routine and a rest week', async () => {
		await render(WeekRoutineSheet, { props: props() });
		await expect
			.element(page.getByRole('button', { name: /Chest & Shoulders/ }))
			.toBeInTheDocument();
		await expect.element(page.getByText('Nothing scheduled, on purpose.')).toBeInTheDocument();
	});

	it('shows the current assignment as chosen', async () => {
		await render(WeekRoutineSheet, { props: props({ current: 'push' }) });
		await expect
			.element(page.getByRole('button', { name: /Chest & Shoulders/ }))
			.toHaveAttribute('aria-pressed', 'true');
		await expect
			.element(page.getByRole('button', { name: /Rest week/ }))
			.toHaveAttribute('aria-pressed', 'false');
	});

	it('reports the routine that was picked', async () => {
		const onpick = vi.fn();
		await render(WeekRoutineSheet, { props: props({ onpick }) });
		await page.getByRole('button', { name: /Rest week/ }).click();
		expect(onpick).toHaveBeenCalledWith(REST_WEEK);
	});

	it('stays shut until a week is opened', async () => {
		await render(WeekRoutineSheet, {
			props: { week: WEEK, year: 2026, options: OPTIONS, onpick: vi.fn(), onclose: vi.fn() }
		});
		expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
	});

	it('renders nothing until a week is chosen', async () => {
		await render(WeekRoutineSheet, { props: props({ week: null }) });
		expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
	});
});
