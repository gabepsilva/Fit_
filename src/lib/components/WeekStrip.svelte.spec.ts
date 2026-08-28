import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { addDaysISO, todayISO, weekdayShort } from '$lib/domain/utils';
import WeekStrip from './WeekStrip.svelte';

describe('WeekStrip', () => {
	it('shows seven days', async () => {
		await render(WeekStrip, { props: { logged: new Set<string>(), selected: todayISO() } });
		await expect.element(page.getByRole('button').first()).toBeInTheDocument();
		expect(document.querySelectorAll('button')).toHaveLength(7);
	});

	it('labels the current day "Today" rather than by weekday', async () => {
		await render(WeekStrip, { props: { logged: new Set<string>(), selected: todayISO() } });
		await expect.element(page.getByText('Today')).toBeInTheDocument();
	});

	it('labels the other days by weekday', async () => {
		const yesterday = addDaysISO(todayISO(), -1);
		await render(WeekStrip, { props: { logged: new Set<string>(), selected: todayISO() } });
		await expect.element(page.getByText(weekdayShort(yesterday))).toBeInTheDocument();
	});

	it('marks the selected day as pressed', async () => {
		await render(WeekStrip, { props: { logged: new Set<string>(), selected: todayISO() } });
		await expect
			.element(page.getByRole('button', { name: /Today/ }))
			.toHaveAttribute('aria-pressed', 'true');
	});

	it('selects the day that was tapped', async () => {
		const yesterday = addDaysISO(todayISO(), -1);
		const props = $state({ logged: new Set<string>(), selected: todayISO() });
		await render(WeekStrip, { props });
		await page.getByRole('button', { name: new RegExp(weekdayShort(yesterday)) }).click();
		expect(props.selected).toBe(yesterday);
	});

	it('marks a logged day that is not selected in the primary color', async () => {
		const yesterday = addDaysISO(todayISO(), -1);
		await render(WeekStrip, { props: { logged: new Set([yesterday]), selected: todayISO() } });
		expect(document.querySelectorAll('.bg-primary').length).toBeGreaterThan(0);
	});

	it('leaves an unlogged day with an empty marker', async () => {
		await render(WeekStrip, { props: { logged: new Set<string>(), selected: todayISO() } });
		expect(document.querySelectorAll('.bg-border').length).toBeGreaterThan(0);
	});

	it('marks a logged day with a filled dot', async () => {
		await render(WeekStrip, { props: { logged: new Set([todayISO()]), selected: todayISO() } });
		expect(document.querySelectorAll('.bg-primary-foreground').length).toBeGreaterThan(0);
	});
});
