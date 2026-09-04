import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { FOOD_BY_ID } from '$lib/domain/foods';
import type { QuantifiedItem } from '$lib/domain/quantity';
import ProposalRow from './ProposalRow.svelte';

const matched: QuantifiedItem = {
	foodId: 'egg-large',
	query: 'eggs',
	name: 'Egg, large',
	servings: 2,
	meal: 'breakfast',
	confidence: 0.92
};

const unmatched: QuantifiedItem = { ...matched, foodId: null, name: 'gruel', confidence: 0 };

const handlers = {
	onmatch: vi.fn(),
	onpickmatch: vi.fn(),
	onchange: vi.fn(),
	onremove: vi.fn()
};

describe('ProposalRow', () => {
	it('names the proposal', async () => {
		await render(ProposalRow, {
			props: { item: matched, step: 0.5, matching: false, ...handlers }
		});
		await expect.element(page.getByText('Egg, large')).toBeInTheDocument();
	});

	it('shows how confident the parse was', async () => {
		await render(ProposalRow, {
			props: { item: matched, step: 0.5, matching: false, ...handlers }
		});
		await expect.element(page.getByText(/92% sure/)).toBeInTheDocument();
	});

	it('shows the catalog serving label for a matched item', async () => {
		await render(ProposalRow, {
			props: { item: matched, step: 0.5, matching: false, ...handlers }
		});
		await expect
			.element(page.getByText(FOOD_BY_ID['egg-large']?.servingLabel ?? ''))
			.toBeInTheDocument();
	});

	it('offers to match an item that has no catalog food', async () => {
		await render(ProposalRow, {
			props: { item: unmatched, step: 0.5, matching: false, ...handlers }
		});
		await expect
			.element(page.getByRole('button', { name: 'Match to catalog' }))
			.toBeInTheDocument();
	});

	it('falls back to a generic serving label when unmatched', async () => {
		await render(ProposalRow, {
			props: { item: unmatched, step: 0.5, matching: false, ...handlers }
		});
		// Exact: the row also states the recorded amount, which contains "servings".
		await expect.element(page.getByText('serving', { exact: true })).toBeInTheDocument();
	});

	it('asks to open the matcher', async () => {
		const onmatch = vi.fn();
		await render(ProposalRow, {
			props: { item: unmatched, step: 0.5, matching: false, ...handlers, onmatch }
		});
		await page.getByRole('button', { name: 'Match to catalog' }).click();
		expect(onmatch).toHaveBeenCalled();
	});

	it('shows the catalog search while matching', async () => {
		await render(ProposalRow, {
			props: { item: unmatched, step: 0.5, matching: true, ...handlers }
		});
		await expect.element(page.getByPlaceholder('Find a catalog match')).toBeInTheDocument();
	});

	it('reports a serving change', async () => {
		const onchange = vi.fn();
		await render(ProposalRow, {
			props: { item: matched, step: 0.5, matching: false, ...handlers, onchange }
		});
		await page.getByRole('button', { name: 'Increase' }).click();
		expect(onchange).toHaveBeenCalledWith(expect.objectContaining({ servings: 2.5 }));
	});

	it('states what will be logged, in servings and in grams', async () => {
		await render(ProposalRow, {
			props: { item: matched, step: 0.5, matching: false, ...handlers }
		});
		// A large egg is 50 g a serving.
		await expect.element(page.getByText('2 servings · 100 g')).toBeInTheDocument();
	});

	it('names the quantity it could not use, and what it recorded instead', async () => {
		const item: QuantifiedItem = {
			...matched,
			servings: 1,
			quantity: { amount: 2, unit: 'cups', kind: 'volume' }
		};
		await render(ProposalRow, { props: { item, step: 0.5, matching: false, ...handlers } });
		await expect
			.element(page.getByText('Couldn’t use “2 cups” — recorded as 1 serving · 50 g'))
			.toBeInTheDocument();
	});

	it('says nothing about a unit it did use', async () => {
		const item: QuantifiedItem = {
			...matched,
			quantity: { amount: 100, unit: 'g', kind: 'mass' }
		};
		await render(ProposalRow, { props: { item, step: 0.5, matching: false, ...handlers } });
		await expect.element(page.getByText('2 servings · 100 g')).toBeInTheDocument();
	});

	it('reports a removal', async () => {
		const onremove = vi.fn();
		await render(ProposalRow, {
			props: { item: matched, step: 0.5, matching: false, ...handlers, onremove }
		});
		await page.getByRole('button', { name: /Remove/ }).click();
		expect(onremove).toHaveBeenCalled();
	});
});
