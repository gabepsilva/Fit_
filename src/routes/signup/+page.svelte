<script lang="ts">
	import { toast } from 'svelte-sonner';
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
	let householdName = $state('');
	let deviceLabel = $state('');
	let busy = $state(false);
	let problem = $state<FormProblem | null>(null);

	const notice = $derived(problem !== null && problem.field === null ? problem.message : null);

	function fieldError(field: string): string | undefined {
		return problem?.field === field ? problem.message : undefined;
	}

	// Blank household falls back to the display name; every row is filtered by household_id.
	function submitted() {
		const label = deviceLabel.trim();
		const name = displayName.trim();
		return {
			username: username.trim(),
			displayName: name,
			password,
			householdName: householdName.trim() === '' ? name : householdName.trim(),
			deviceLabel: label === '' ? undefined : label
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
		toast(`Welcome, ${result.value.account.displayName}.`);
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

		<AuthField
			id="signup-household"
			label="Household"
			bind:value={householdName}
			autocomplete="off"
			hint="Optional. The kitchen everyone's plates belong to; your name by default."
			error={fieldError('householdName')}
		/>

		<AuthField
			id="signup-device"
			label="Name this device"
			bind:value={deviceLabel}
			autocomplete="off"
			hint="Optional. It is how you will recognize this session later."
			error={fieldError('deviceLabel')}
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
