<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/ui/Button.svelte';

	/**
	 * What a device with no document of its own shows in the moment between
	 * signing in and the first pull landing, instead of Onboarding.
	 *
	 * A person with months of history who signs in on a new phone is, until the
	 * pull settles, indistinguishable — to this device — from someone who has
	 * never used the app. Showing Onboarding in that gap tells them their
	 * history is gone; showing nothing looks like the app has hung. This says
	 * plainly that something is on its way — and, if it takes too long, offers
	 * a way out rather than holding someone on a screen with nothing to press.
	 */
	let { onretry, oncontinue }: { onretry: () => void; oncontinue: () => void } = $props();

	/**
	 * How long before someone stuck here is offered a way out.
	 *
	 * `sync`'s own request gives up on a hung connection after ten seconds, so
	 * this fires well before that — a person is not made to wait for the
	 * network layer's own timeout before this screen admits anything is wrong.
	 * An ordinary pull settles in well under a second, so this never appears
	 * on a working connection.
	 */
	const ESCAPE_DELAY_MS = 5000;

	let announcement = $state('');
	let showEscape = $state(false);

	onMount(() => {
		// Set after mount rather than in the initial markup: a live region's
		// first paint with its text already inside it is not reliably announced
		// by assistive tech — only a mutation to a region already in the DOM is.
		announcement = 'Loading your data…';
	});

	$effect(() => {
		const id = setTimeout(() => (showEscape = true), ESCAPE_DELAY_MS);
		return () => clearTimeout(id);
	});
</script>

<div
	class="flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-3 px-5 py-10 text-center"
>
	<div
		class="border-muted-foreground/30 border-t-muted-foreground size-6 animate-spin rounded-full border-2"
		aria-hidden="true"
	></div>
	<p class="text-muted-foreground text-sm" role="status">{announcement}</p>
	{#if showEscape}
		<div class="mt-4 flex flex-col items-center gap-3">
			<p class="text-muted-foreground max-w-xs text-sm">This is taking longer than expected.</p>
			<div class="flex gap-2">
				<Button variant="secondary" size="sm" onclick={onretry}>Try again</Button>
				<Button variant="quiet" size="sm" onclick={oncontinue}>Continue without waiting</Button>
			</div>
		</div>
	{/if}
</div>
