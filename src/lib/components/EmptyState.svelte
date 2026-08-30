<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A card for a screen that has nothing on it yet: what is missing, why, and
	 * the one way out. One component so the six such screens cannot each invent
	 * their own idea of what "nothing here" looks like.
	 *
	 * The heading is the page's own — screens below the Exercise home carry a
	 * `ScreenHeader`, whose title is a label rather than a heading, so an empty
	 * screen would otherwise have no heading at all.
	 */
	let {
		title,
		children,
		action
	}: {
		/** Omitted where the card sits under a screen that already names itself. */
		title?: string | undefined;
		children: Snippet;
		action?: Snippet;
	} = $props();
</script>

<section
	class="bg-card flex flex-col items-center gap-3 rounded-3xl px-5 py-10 text-center shadow-border"
>
	{#if title}
		<h1 class="font-display text-xl tracking-tight">{title}</h1>
	{/if}
	<p class="text-muted-foreground max-w-xs text-sm">{@render children()}</p>
	{#if action}
		{@render action()}
	{/if}
</section>
