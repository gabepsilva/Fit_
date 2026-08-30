<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { signIn, type AuthFailure } from '$lib/auth/api';
	import { placeFailure, waitWording, type FormProblem } from '$lib/auth/wording';
	import { session } from '$lib/state/session.svelte';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Button from '$lib/ui/Button.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let username = $state('');
	let password = $state('');
	let deviceLabel = $state('');
	let busy = $state(false);
	let problem = $state<FormProblem | null>(null);

	/** When the throttle will accept another attempt, as a wall-clock time. */
	let held = $state<number | null>(null);
	let now = $state(Date.now());

	/**
	 * The server let this page render, so `locals.auth` was null and nothing is
	 * signed in here — whatever the cached record says. That record is only
	 * disproved when a server actually looked, which is what `serverChecked`
	 * reports and the static build cannot.
	 */
	onMount(() => {
		if (data.serverChecked) session.forget();
	});

	const waitLeft = $derived(held === null ? 0 : Math.max(0, Math.ceil((held - now) / 1000)));
	const waiting = $derived(waitLeft > 0);

	/**
	 * The wait is the distance to an end time rather than a number ticked down,
	 * so a phone that stopped firing intervals in a pocket comes back with the
	 * time that is actually left. Rendering the sentence once would leave "try
	 * again in 60 seconds" on screen a minute after it stopped being true.
	 */
	$effect(() => {
		if (held === null) return;
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});

	const notice = $derived.by(() => {
		if (waiting) return `Too many attempts. Try again in ${waitWording(waitLeft)}.`;
		if (held !== null) return 'The wait is over. Try again.';
		return problem !== null && problem.field === null ? problem.message : null;
	});

	function fieldError(field: string): string | undefined {
		return problem?.field === field ? problem.message : undefined;
	}

	/**
	 * A throttled attempt is held against the clock rather than described once,
	 * but only when `Retry-After` said how long. Without it there is no length to
	 * count down, and inventing one would tell someone to wait for a number the
	 * server never promised — so it falls through to the plain sentence.
	 */
	function fail(failure: AuthFailure) {
		const seconds = failure.code === 'too-many-attempts' ? failure.retryAfterSeconds : undefined;
		if (seconds === undefined) {
			held = null;
			problem = placeFailure(failure);
			return;
		}
		now = Date.now();
		held = now + seconds * 1000;
		problem = null;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || waiting) return;
		busy = true;
		const label = deviceLabel.trim();
		const result = await signIn({
			username: username.trim(),
			password,
			deviceLabel: label === '' ? undefined : label
		});
		busy = false;
		if (!result.ok) {
			fail(result.failure);
			return;
		}
		problem = null;
		held = null;
		session.begin(result.value);
		toast(`Signed in as ${result.value.account.displayName}.`);
		await goto(resolve('/'));
	}
</script>

<svelte:head>
	<title>Sign in · Fit_</title>
</svelte:head>

<div class="flex flex-col gap-6 pb-10">
	<PageHeader kicker="Account" title="Sign in">
		Your journal stays on this device either way. An account is what will let it follow you to
		another one.
	</PageHeader>

	<form class="flex flex-col gap-4" onsubmit={submit}>
		{#if notice}
			<AuthNotice message={notice} />
		{/if}

		<AuthField
			id="signin-username"
			label="Username"
			bind:value={username}
			autocomplete="username"
			autocapitalize="none"
			spellcheck="false"
			error={fieldError('username')}
		/>

		<AuthField
			id="signin-password"
			label="Password"
			type="password"
			bind:value={password}
			autocomplete="current-password"
			error={fieldError('password')}
		/>

		<AuthField
			id="signin-device"
			label="Name this device"
			bind:value={deviceLabel}
			autocomplete="off"
			hint="Optional. It is how you will recognize this session later."
			error={fieldError('deviceLabel')}
		/>

		<Button type="submit" size="lg" disabled={busy || waiting}>
			{busy ? 'Signing in…' : 'Sign in'}
		</Button>
	</form>

	<p class="text-muted-foreground text-sm">
		No account yet?
		<a href={resolve('/signup')} class="text-primary font-medium">Create one</a>.
	</p>
</div>
