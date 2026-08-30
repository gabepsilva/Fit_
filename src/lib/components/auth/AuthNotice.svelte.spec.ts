import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import AuthNotice from './AuthNotice.svelte';

describe('AuthNotice', () => {
	it('says what went wrong', async () => {
		await render(AuthNotice, { message: 'That username and password don’t match.' });
		await expect
			.element(page.getByText('That username and password don’t match.'))
			.toBeInTheDocument();
	});

	it('is an alert, so it reaches someone whose focus is on the button', async () => {
		await render(AuthNotice, { message: 'Too many attempts.' });
		await expect.element(page.getByRole('alert')).toHaveTextContent('Too many attempts.');
	});
});
