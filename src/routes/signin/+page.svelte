<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { signIn, type AuthFailure } from '$lib/auth/api';
	import { returnPath } from '$lib/components/auth/auth-routes';
	import { placeFailure, waitWording, type FormProblem } from '$lib/auth/wording';
	import { session } from '$lib/state/session.svelte';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Button from '$lib/ui/Button.svelte';

	/**
	 * The page the gate turned away, or the front one when it sent nobody.
	 *
	 * The origin comes from the address this page was loaded at rather than from
	 * a constant, because it is what `returnPath` measures the parameter against
	 * and there is exactly one right answer for it: wherever this app is being
	 * served from now.
	 */
	const target = $derived(
		returnPath(page.url?.searchParams.get('next') ?? null, page.url?.origin ?? '')
	);

	/**
	 * A session this device has but cannot see.
	 *
	 * The credential is an `HttpOnly` cookie, so a browser whose `localStorage`
	 * was cleared — or a Capacitor build reinstalled over a live session — has no
	 * record to show the gate and is sent here holding a perfectly good one. The
	 * server is the only thing that can say so, and this is the one screen where
	 * asking is worth a request: everywhere else the gate has already decided.
	 */
	onMount(() => {
		void reconcile();
	});

	async function reconcile() {
		if (session.signedIn || (await session.refresh())) await goto(target);
	}

	let username = $state('');
	let password = $state('');
	let busy = $state(false);
	let problem = $state<FormProblem | null>(null);

	/** Throttle expiry as a wall-clock timestamp, or null. */
	let held = $state<number | null>(null);
	let now = $state(Date.now());

	const waitLeft = $derived(held === null ? 0 : Math.max(0, Math.ceil((held - now) / 1000)));
	const waiting = $derived(waitLeft > 0);

	// End time, not a countdown: intervals stop in a pocket but wall-clock doesn't.
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

	// Count down only when Retry-After is present; otherwise show a plain message.
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
		const result = await signIn({ username: username.trim(), password });
		busy = false;
		if (!result.ok) {
			fail(result.failure);
			return;
		}
		problem = null;
		held = null;
		session.begin(result.value);
		await goto(target);
	}
</script>

<svelte:head>
	<title>Sign in · Fit_</title>
</svelte:head>

<div class="flex w-full flex-col gap-6">
	<PageHeader kicker="Fit_" title="Sign in">
		Fit_ opens once you are signed in. Your journal is kept on this device, and the account is what
		will let it follow you to another one.
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

		<Button type="submit" size="lg" disabled={busy || waiting}>
			{busy ? 'Signing in…' : 'Sign in'}
		</Button>
	</form>

	<p class="text-muted-foreground text-sm">
		No account yet?
		<a href={resolve('/signup')} class="text-primary font-medium">Create one</a>.
	</p>
</div>
