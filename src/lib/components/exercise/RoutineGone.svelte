<script lang="ts">
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import LinkButton from '$lib/ui/LinkButton.svelte';
	import ScreenHeader from './ScreenHeader.svelte';

	/**
	 * A routine screen reached by an id that no longer names anything — a stale
	 * link, or a routine deleted in another tab. Both the sheet and the builder
	 * land here, so they say it once and in the same words.
	 */
	let {
		/** What the screen would have been called had the routine still existed. */
		title
	}: { title: string } = $props();
</script>

<div class="flex flex-col gap-4">
	<ScreenHeader back="/exercise" backLabel="Back to Exercise" {title} />
	<EmptyState>
		That routine is gone.
		{#snippet action()}
			<LinkButton href={resolve('/exercise')}>Back to Exercise</LinkButton>
		{/snippet}
	</EmptyState>
</div>
