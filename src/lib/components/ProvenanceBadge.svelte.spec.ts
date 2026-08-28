import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { PROVENANCE_LABEL } from '$lib/domain/foods';
import ProvenanceBadge from './ProvenanceBadge.svelte';

describe('ProvenanceBadge', () => {
	it('names the source', async () => {
		await render(ProvenanceBadge, { props: { provenance: 'usda' } });
		await expect.element(page.getByText(PROVENANCE_LABEL.usda.title)).toBeInTheDocument();
	});

	it('explains the source on hover', async () => {
		await render(ProvenanceBadge, { props: { provenance: 'usda' } });
		await expect.element(page.getByTitle(PROVENANCE_LABEL.usda.detail)).toBeInTheDocument();
	});

	it('renders nothing when the provenance is unknown', async () => {
		await render(ProvenanceBadge, { props: {} });
		expect(document.body.textContent?.trim()).toBe('');
	});

	it('styles a public-domain source distinctly from a community one', async () => {
		await render(ProvenanceBadge, { props: { provenance: 'usda' } });
		await expect.element(page.getByText(PROVENANCE_LABEL.usda.title)).toHaveClass(/bg-accent/);
	});

	it('styles an Open Food Facts source as secondary', async () => {
		await render(ProvenanceBadge, { props: { provenance: 'off' } });
		await expect.element(page.getByText(PROVENANCE_LABEL.off.title)).toHaveClass(/bg-secondary/);
	});

	it('styles a community source as the quietest', async () => {
		await render(ProvenanceBadge, { props: { provenance: 'community' } });
		await expect.element(page.getByText(PROVENANCE_LABEL.community.title)).toHaveClass(/bg-linen/);
	});
});
