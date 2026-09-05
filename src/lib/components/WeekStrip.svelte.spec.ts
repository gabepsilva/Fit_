import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { addDaysISO, todayISO } from '$lib/domain/utils';
import { dayStripLabel } from '$lib/domain/week-strip';
import WeekStrip from './WeekStrip.svelte';

const empty = () => new Set<string>();

describe('WeekStrip', () => {
	it('shows the full 38-day range', async () => {
		await render(WeekStrip, {
			props: { food: empty(), exercise: empty(), weight: empty(), selected: todayISO() }
		});
		await expect.element(page.getByRole('button').first()).toBeInTheDocument();
		expect(document.querySelectorAll('button')).toHaveLength(38);
	});

	it('labels the current day "Today" rather than by weekday', async () => {
		await render(WeekStrip, {
			props: { food: empty(), exercise: empty(), weight: empty(), selected: todayISO() }
		});
		await expect.element(page.getByText('Today')).toBeInTheDocument();
	});

	it('labels the other days by weekday', async () => {
		const yesterday = addDaysISO(todayISO(), -1);
		await render(WeekStrip, {
			props: { food: empty(), exercise: empty(), weight: empty(), selected: todayISO() }
		});
		await expect
			.element(page.getByText(dayStripLabel(yesterday), { exact: true }))
			.toBeInTheDocument();
	});

	it('marks the selected day as pressed', async () => {
		await render(WeekStrip, {
			props: { food: empty(), exercise: empty(), weight: empty(), selected: todayISO() }
		});
		await expect
			.element(page.getByRole('button', { name: /Today/ }))
			.toHaveAttribute('aria-pressed', 'true');
	});

	it('selects the day that was tapped', async () => {
		const yesterday = addDaysISO(todayISO(), -1);
		const props = $state({
			food: empty(),
			exercise: empty(),
			weight: empty(),
			selected: todayISO()
		});
		await render(WeekStrip, { props });
		await page
			.getByRole('button', { name: `${dayStripLabel(yesterday)} nothing logged`, exact: true })
			.click();
		expect(props.selected).toBe(yesterday);
	});

	it('marks a logged day that is not selected in the primary color', async () => {
		const yesterday = addDaysISO(todayISO(), -1);
		await render(WeekStrip, {
			props: {
				food: new Set([yesterday]),
				exercise: empty(),
				weight: empty(),
				selected: todayISO()
			}
		});
		expect(document.querySelectorAll('.text-primary').length).toBeGreaterThan(0);
	});

	it('leaves an unlogged day with faint icons', async () => {
		await render(WeekStrip, {
			props: { food: empty(), exercise: empty(), weight: empty(), selected: todayISO() }
		});
		expect(document.querySelectorAll('.text-muted-foreground\\/50').length).toBeGreaterThan(0);
	});

	it('marks the selected day that was logged in the primary-foreground color', async () => {
		await render(WeekStrip, {
			props: {
				food: new Set([todayISO()]),
				exercise: empty(),
				weight: empty(),
				selected: todayISO()
			}
		});
		expect(document.querySelectorAll('.text-primary-foreground').length).toBeGreaterThan(0);
	});

	it('shows only the food icon coloured when only food was logged', async () => {
		const yesterday = addDaysISO(todayISO(), -1);
		await render(WeekStrip, {
			props: {
				food: new Set([yesterday]),
				exercise: empty(),
				weight: empty(),
				selected: todayISO()
			}
		});
		await expect.element(page.getByText('food logged')).toBeInTheDocument();
	});

	it('names all three when food, exercise and weight were all logged', async () => {
		const yesterday = addDaysISO(todayISO(), -1);
		await render(WeekStrip, {
			props: {
				food: new Set([yesterday]),
				exercise: new Set([yesterday]),
				weight: new Set([yesterday]),
				selected: todayISO()
			}
		});
		await expect.element(page.getByText('food, exercise, weight logged')).toBeInTheDocument();
	});

	it('says nothing logged for a day with no marks', async () => {
		await render(WeekStrip, {
			props: { food: empty(), exercise: empty(), weight: empty(), selected: todayISO() }
		});
		await expect.element(page.getByText('nothing logged').first()).toBeInTheDocument();
	});

	it('keeps exactly one pill tabbable, the selected one', async () => {
		await render(WeekStrip, {
			props: { food: empty(), exercise: empty(), weight: empty(), selected: todayISO() }
		});
		const buttons = Array.from(document.querySelectorAll('button'));
		const tabbable = buttons.filter((button) => button.tabIndex === 0);
		expect(tabbable).toHaveLength(1);
		expect(tabbable[0]).toBe(
			page.getByRole('button', { name: /^Today/ }).element() as HTMLButtonElement
		);
	});

	it('moves focus to the next pill on ArrowRight', async () => {
		await render(WeekStrip, {
			props: { food: empty(), exercise: empty(), weight: empty(), selected: todayISO() }
		});
		const buttons = Array.from(document.querySelectorAll('button'));
		const todayIndex = buttons.indexOf(
			page.getByRole('button', { name: /^Today/ }).element() as HTMLButtonElement
		);
		const todayButton = buttons[todayIndex];
		expect(todayButton).toBeDefined();
		todayButton?.focus();
		todayButton?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
		);
		expect(document.activeElement).toBe(buttons[todayIndex + 1]);
	});
});
