import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import SwapSheet from './SwapSheet.svelte';

function setup(name: string) {
	const picked: string[] = [];
	const closed: number[] = [];
	return {
		picked,
		closed,
		props: {
			open: true,
			name,
			onclose: () => closed.push(1),
			onpick: (replacement: string) => picked.push(replacement)
		}
	};
}

describe('SwapSheet', () => {
	it('says which group it is offering', async () => {
		const { props } = setup('Bench Press');
		await render(SwapSheet, { props });
		await expect
			.element(page.getByText('Machine taken? Pick another chest movement.'))
			.toBeInTheDocument();
	});

	it('offers the rest of the group and not the movement itself', async () => {
		const { props } = setup('Bench Press');
		await render(SwapSheet, { props });
		await expect.element(page.getByText('Pec Deck')).toBeInTheDocument();
		expect(page.getByText('Bench Press', { exact: true }).elements()).toHaveLength(0);
	});

	it('makes the whole row the choice, with nothing to tick', async () => {
		const { props } = setup('Bench Press');
		await render(SwapSheet, { props });
		expect(page.getByRole('checkbox').elements()).toHaveLength(0);
		await expect.element(page.getByRole('button', { name: /Pec Deck/ })).toBeInTheDocument();
	});

	it('reports the pick and closes behind it', async () => {
		const { props, picked, closed } = setup('Bench Press');
		await render(SwapSheet, { props });
		await page.getByText('Pec Deck').click();
		expect(picked).toEqual(['Pec Deck']);
		expect(closed).toHaveLength(1);
	});

	it('is honest when the library has nothing else to offer', async () => {
		const { props } = setup('Sled Push');
		await render(SwapSheet, { props });
		await expect
			.element(page.getByText('Nothing else in the library trains this group.'))
			.toBeInTheDocument();
	});
});
