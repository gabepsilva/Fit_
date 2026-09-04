import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { FOODS } from '$lib/domain/foods';
import FoodSearch from './FoodSearch.svelte';

const SEARCH = 'Search foods, brands, barcodes';

describe('FoodSearch', () => {
	it('offers a starter list before anything is typed', async () => {
		await render(FoodSearch, { props: { onpick: vi.fn() } });
		expect(document.querySelectorAll('li').length).toBeGreaterThan(0);
	});

	it('narrows the list as you type', async () => {
		await render(FoodSearch, { props: { onpick: vi.fn() } });
		const before = document.querySelectorAll('li').length;
		await page.getByLabelText(SEARCH).fill('chicken breast');
		expect(document.querySelectorAll('li').length).toBeLessThan(before);
	});

	it('finds a packaged food by its barcode', async () => {
		const barcoded = FOODS.find((f) => f.barcode);
		expect(barcoded).toBeDefined();
		await render(FoodSearch, { props: { onpick: vi.fn() } });
		await page.getByLabelText(SEARCH).fill(barcoded?.barcode ?? '');
		await expect.element(page.getByText(barcoded?.name ?? '')).toBeInTheDocument();
	});

	it('hands the chosen food to the caller', async () => {
		const onpick = vi.fn();
		await render(FoodSearch, { props: { onpick } });
		await page.getByLabelText(SEARCH).fill('chicken breast');
		await page.getByRole('button').first().click();
		expect(onpick).toHaveBeenCalledWith(expect.objectContaining({ id: 'chicken-breast' }));
	});

	it('explains itself rather than going blank when nothing matches', async () => {
		await render(FoodSearch, { props: { onpick: vi.fn() } });
		await page.getByLabelText(SEARCH).fill('qqqzzz');
		await expect.element(page.getByText(/Nothing in the catalog/)).toBeInTheDocument();
	});

	it('accepts a custom placeholder', async () => {
		await render(FoodSearch, { props: { onpick: vi.fn(), placeholder: 'Find a catalog match' } });
		await expect.element(page.getByPlaceholder('Find a catalog match')).toBeInTheDocument();
	});

	it('shows per-serving energy alongside each result', async () => {
		await render(FoodSearch, { props: { onpick: vi.fn() } });
		await page.getByLabelText(SEARCH).fill('chicken breast');
		await expect.element(page.getByText(/kcal/).first()).toBeInTheDocument();
	});

	it('keeps the provenance badge from wrapping when the name truncates', async () => {
		// Regression: a long name (e.g. "Caffè latte, 12 oz whole milk") and a
		// two-word badge ("Brand published") shared a row with no min-w-0 on the
		// name or shrink-0 on the badge, so the badge wrapped to two lines and
		// made that row taller than its neighbors.
		await render(FoodSearch, { props: { onpick: vi.fn() } });
		await page.getByLabelText(SEARCH).fill('latte');
		const name = document.body.querySelector<HTMLElement>('p.truncate');
		expect(name?.className).toMatch(/\bmin-w-0\b/);
		const badge = page.getByText('Brand published');
		await expect.element(badge).toBeInTheDocument();
		const badgeWrapper = badge.element().closest('span.shrink-0');
		expect(badgeWrapper).not.toBeNull();
	});
});
