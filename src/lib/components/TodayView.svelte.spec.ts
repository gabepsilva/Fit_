import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { logFromFood } from '$lib/domain/log-entry';
import { emptyProfile } from '$lib/domain/profile';
import type { LogSource, Meal } from '$lib/domain/types';
import { addDaysISO, todayISO, weekdayLong, weekdayShort } from '$lib/domain/utils';
import { logUi } from '$lib/state/log-ui.svelte';
import { tend } from '$lib/state/tend.svelte';
import TodayView from './TodayView.svelte';

/** Log one catalog food, the way the sheet does it. */
function logFood(args: {
	foodId: string;
	servings: number;
	meal: Meal;
	date?: string;
	source?: LogSource;
}) {
	tend.addLogItems([
		logFromFood({ ...args, date: args.date ?? todayISO(), source: args.source ?? 'manual' })
	]);
}

function logName() {
	return tend.profile?.log[0]?.name ?? '';
}

function onboard(glp1 = false) {
	tend.resetAll();
	tend.completeOnboarding({
		profile: { ...emptyProfile({ name: 'Alex' }), glp1, goal: glp1 ? 'glp1' : 'lose' },
		household: false,
		useSample: false
	});
}

beforeEach(() => {
	localStorage.clear();
	logUi.open = false;
	onboard();
});

describe('TodayView', () => {
	it('heads the page with Today', async () => {
		await render(TodayView);
		await expect
			.element(page.getByRole('heading', { name: 'Today', level: 1 }))
			.toBeInTheDocument();
	});

	it('opens with an invitation rather than a scolding when nothing is logged', async () => {
		await render(TodayView);
		await expect.element(page.getByText('Whenever you log is a good time.')).toBeInTheDocument();
	});

	it('counts logged days once there is a log', async () => {
		logFood({ foodId: 'egg-large', servings: 2, meal: 'breakfast' });
		await render(TodayView);
		await expect.element(page.getByText(/1 day logged this week/)).toBeInTheDocument();
	});

	it('pluralizes the logged-day count', async () => {
		logFood({ foodId: 'egg-large', servings: 2, meal: 'breakfast' });
		logFood({
			foodId: 'egg-large',
			servings: 2,
			meal: 'breakfast',
			date: addDaysISO(todayISO(), -1)
		});
		await render(TodayView);
		await expect.element(page.getByText(/2 days logged this week/)).toBeInTheDocument();
	});

	it('collapses an expanded entry when tapped again', async () => {
		logFood({ foodId: 'egg-large', servings: 2, meal: 'breakfast' });
		await render(TodayView);
		const row = page.getByRole('button', { name: new RegExp(logName()) });
		await row.click();
		await row.click();
		expect(document.body.textContent).not.toContain('Remove');
	});

	it('steps servings in quarters on GLP-1', async () => {
		onboard(true);
		logFood({ foodId: 'egg-large', servings: 1, meal: 'breakfast' });
		await render(TodayView);
		await page.getByRole('button', { name: new RegExp(logName()) }).click();
		await page.getByRole('button', { name: 'Increase' }).click();
		expect(tend.profile?.log[0]?.servings).toBe(1.25);
	});

	it('lists every meal section', async () => {
		await render(TodayView);
		for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
			await expect.element(page.getByRole('heading', { name: meal, level: 2 })).toBeInTheDocument();
		}
	});

	it('treats an empty meal as fine, not a failure', async () => {
		await render(TodayView);
		await expect.element(page.getByText('Nothing here. That’s fine.').first()).toBeInTheDocument();
	});

	it('shows a logged entry under its meal', async () => {
		logFood({ foodId: 'egg-large', servings: 2, meal: 'breakfast' });
		await render(TodayView);
		await expect.element(page.getByText(logName()).first()).toBeInTheDocument();
	});

	it('leads with energy for a calorie-led profile', async () => {
		await render(TodayView);
		await expect.element(page.getByText('Energy').first()).toBeInTheDocument();
	});

	it('leads with protein on GLP-1', async () => {
		onboard(true);
		await render(TodayView);
		await expect.element(page.getByText('Protein').first()).toBeInTheDocument();
	});

	it('shows fiber as a ring on GLP-1', async () => {
		onboard(true);
		await render(TodayView);
		await expect.element(page.getByText('Fiber').first()).toBeInTheDocument();
	});

	it('says plainly that unlogged days are not counted as zero', async () => {
		await render(TodayView);
		expect(document.body.textContent?.replace(/\s+/g, ' ')).toContain(
			'unlogged days are not counted as zero'
		);
	});

	it('opens the log sheet from the primary action', async () => {
		await render(TodayView);
		await page.getByRole('button', { name: 'Log something' }).click();
		expect(logUi.open).toBe(true);
	});

	it('opens the log sheet from an empty meal slot', async () => {
		await render(TodayView);
		await page.getByRole('button', { name: 'Nothing here. That’s fine.' }).first().click();
		expect(logUi.open).toBe(true);
	});

	it('expands an entry when it is tapped', async () => {
		logFood({ foodId: 'egg-large', servings: 2, meal: 'breakfast' });
		await render(TodayView);
		await page.getByRole('button', { name: new RegExp(logName()) }).click();
		await expect.element(page.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
	});

	it('switches to another day from the week strip', async () => {
		const yesterday = addDaysISO(todayISO(), -1);
		await render(TodayView);
		await page.getByRole('button', { name: new RegExp(weekdayShort(yesterday)) }).click();
		await expect
			.element(page.getByText(weekdayLong(yesterday).toUpperCase(), { exact: false }))
			.toBeInTheDocument();
	});

	it('renders nothing when there is no active profile', async () => {
		tend.resetAll();
		await render(TodayView);
		expect(document.body.textContent?.trim()).toBe('');
	});

	it('totals energy per meal', async () => {
		logFood({ foodId: 'egg-large', servings: 2, meal: 'breakfast' });
		await render(TodayView);
		const kcal = tend.profile?.log[0]?.kcal ?? 0;
		await expect.element(page.getByText(`${kcal} kcal`).first()).toBeInTheDocument();
	});

	it('names the selected day above the heading', async () => {
		await render(TodayView);
		expect(document.body.textContent).toContain(weekdayLong(todayISO()));
	});
});
