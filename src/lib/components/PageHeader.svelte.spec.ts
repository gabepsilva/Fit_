import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import PageHeaderHarness from './PageHeaderHarness.svelte';

describe('PageHeader', () => {
	it('names the destination as the page heading', async () => {
		await render(PageHeaderHarness, {
			props: { kicker: 'Trend, not a streak', title: 'Progress' }
		});
		await expect
			.element(page.getByRole('heading', { name: 'Progress', level: 1 }))
			.toBeInTheDocument();
	});

	it('shows the kicker above it', async () => {
		await render(PageHeaderHarness, {
			props: { kicker: 'Trend, not a streak', title: 'Progress' }
		});
		await expect.element(page.getByText('Trend, not a streak')).toBeInTheDocument();
	});

	it('shows a lead sentence when it is given one', async () => {
		await render(PageHeaderHarness, {
			props: { kicker: 'On this device', title: 'You', lead: 'Everything stays here.' }
		});
		await expect.element(page.getByText('Everything stays here.')).toBeInTheDocument();
	});

	it('renders no lead paragraph when there is nothing to say', async () => {
		await render(PageHeaderHarness, { props: { kicker: 'On this device', title: 'You' } });
		expect(document.querySelectorAll('header p')).toHaveLength(1);
	});
});
