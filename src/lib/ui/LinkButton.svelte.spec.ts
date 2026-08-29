import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import LinkButton from './LinkButton.svelte';
import { BUTTON_SIZES, BUTTON_VARIANTS } from './button-variants';

const children = createRawSnippet(() => ({ render: () => '<span>Back to Exercise</span>' }));

function link() {
	return page.getByRole('link', { name: 'Back to Exercise' });
}

describe('LinkButton', () => {
	it('navigates rather than acts, so it is a link and not a button', async () => {
		await render(LinkButton, { props: { href: '/exercise', children } });
		await expect.element(link()).toHaveAttribute('href', '/exercise');
		expect(document.querySelectorAll('button')).toHaveLength(0);
	});

	it('wears the filled treatment unless told otherwise', async () => {
		await render(LinkButton, { props: { href: '/exercise', children } });
		const className = document.querySelector('a')?.className ?? '';
		expect(className).toContain(BUTTON_VARIANTS.default);
		expect(className).toContain(BUTTON_SIZES.default);
	});

	it('takes the same variant and size names the button does', async () => {
		await render(LinkButton, {
			props: { href: '/exercise', variant: 'outline', size: 'sm', children }
		});
		const className = document.querySelector('a')?.className ?? '';
		expect(className).toContain(BUTTON_VARIANTS.outline);
		expect(className).toContain(BUTTON_SIZES.sm);
	});

	it('lets whoever placed it add to the class', async () => {
		await render(LinkButton, { props: { href: '/exercise', class: 'shrink-0', children } });
		expect(document.querySelector('a')?.className).toContain('shrink-0');
	});

	it('passes the rest of its attributes through', async () => {
		await render(LinkButton, {
			props: { href: '/exercise', 'aria-label': 'Leave', children }
		});
		await expect.element(page.getByRole('link', { name: 'Leave' })).toBeInTheDocument();
	});
});
