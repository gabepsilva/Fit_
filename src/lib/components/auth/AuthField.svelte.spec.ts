import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import AuthField from './AuthField.svelte';

describe('AuthField', () => {
	it('names the input with its label', async () => {
		await render(AuthField, { id: 'f', label: 'Username' });
		await expect.element(page.getByLabelText('Username')).toBeInTheDocument();
	});

	it('shows the value it was given', async () => {
		await render(AuthField, { id: 'f', label: 'Username', value: 'robin' });
		await expect.element(page.getByLabelText('Username')).toHaveValue('robin');
	});

	it('shows the rule while the field has not been rejected', async () => {
		await render(AuthField, { id: 'f', label: 'Username', hint: 'At least 3 characters.' });
		await expect.element(page.getByText('At least 3 characters.')).toBeInTheDocument();
	});

	it('replaces the rule with the rejection, rather than showing both', async () => {
		await render(AuthField, {
			id: 'f',
			label: 'Username',
			hint: 'At least 3 characters.',
			error: 'That username is taken.'
		});
		await expect.element(page.getByText('That username is taken.')).toBeInTheDocument();
		expect(page.getByText('At least 3 characters.').elements()).toHaveLength(0);
	});

	it('marks a rejected input invalid, so it is announced as one', async () => {
		await render(AuthField, { id: 'f', label: 'Username', error: 'That username is taken.' });
		await expect.element(page.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
	});

	it('leaves a field nobody rejected unmarked', async () => {
		await render(AuthField, { id: 'f', label: 'Username' });
		await expect
			.element(page.getByLabelText('Username'))
			.not.toHaveAttribute('aria-invalid', 'true');
	});

	it('points the input at the rejection, so it is read out with the field', async () => {
		await render(AuthField, { id: 'f', label: 'Username', error: 'That username is taken.' });
		await expect
			.element(page.getByLabelText('Username'))
			.toHaveAccessibleDescription('That username is taken.');
	});

	it('points the input at the rule for the same reason', async () => {
		await render(AuthField, { id: 'f', label: 'Username', hint: 'At least 3 characters.' });
		await expect
			.element(page.getByLabelText('Username'))
			.toHaveAccessibleDescription('At least 3 characters.');
	});

	it('describes nothing when there is nothing to say', async () => {
		await render(AuthField, { id: 'f', label: 'Username' });
		await expect.element(page.getByLabelText('Username')).toHaveAccessibleDescription('');
	});

	it('passes an input type through, so a password is not shown', async () => {
		await render(AuthField, { id: 'f', label: 'Password', type: 'password' });
		await expect.element(page.getByLabelText('Password')).toHaveAttribute('type', 'password');
	});
});
