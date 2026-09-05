<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { register } from '$lib/auth/api';
	import { placeFailure, type FormProblem } from '$lib/auth/wording';
	import { session } from '$lib/state/session.svelte';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Button from '$lib/ui/Button.svelte';

	let username = $state('');
	let displayName = $state('');
	let password = $state('');
	let busy = $state(false);
	let problem = $state<FormProblem | null>(null);

	const notice = $derived(problem !== null && problem.field === null ? problem.message : null);

	function fieldError(field: string): string | undefined {
		return problem?.field === field ? problem.message : undefined;
	}

	// Household name is not collected from the person; every row is filtered by
	// household_id, and the API still requires the field, so it falls back to
	// the display name.
	function submitted() {
		const name = displayName.trim();
		return {
			username: username.trim(),
			displayName: name,
			password,
			householdName: name
		};
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		const result = await register(submitted());
		busy = false;
		if (!result.ok) {
			problem = placeFailure(result.failure);
			return;
		}
		problem = null;
		session.begin(result.value);
		await goto(resolve('/'));
	}
</script>

<svelte:head>
	<title>Create an account · Fit_</title>
</svelte:head>

<div class="flex w-full flex-col gap-6">
	<PageHeader kicker="Fit_" title="Create an account">
		An account is how you get in, and what a second device will one day sign in to. Your journal
		itself is kept on this device.
	</PageHeader>

	<form class="flex flex-col gap-4" onsubmit={submit}>
		{#if notice}
			<AuthNotice message={notice} />
		{/if}

		<AuthField
			id="signup-username"
			label="Username"
			bind:value={username}
			autocomplete="username"
			autocapitalize="none"
			spellcheck="false"
			hint="3 to 32 characters: letters, digits, and . _ -"
			error={fieldError('username')}
		/>

		<AuthField
			id="signup-display-name"
			label="Name"
			bind:value={displayName}
			autocomplete="name"
			hint="What the app calls you."
			error={fieldError('displayName')}
		/>

		<AuthField
			id="signup-password"
			label="Password"
			type="password"
			bind:value={password}
			autocomplete="new-password"
			hint="At least 10 characters. Length beats punctuation."
			error={fieldError('password')}
		/>

		<Button type="submit" size="lg" disabled={busy}>
			{busy ? 'Creating…' : 'Create account'}
		</Button>
	</form>

	<p class="text-muted-foreground text-sm">
		Already have one?
		<a href={resolve('/signin')} class="text-primary font-medium">Sign in</a>.
	</p>
</div>
