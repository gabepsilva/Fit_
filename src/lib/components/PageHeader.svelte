<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The top of every destination: a quiet kicker, the name of the place, and
	 * an optional sentence under it. One component so the six pages cannot
	 * drift apart in type scale or spacing.
	 *
	 * The matching document title lives in the route beside it: page metadata
	 * belongs to the page, and a `<svelte:head>` here would be a document-level
	 * effect hidden inside a presentational component.
	 */
	let { kicker, title, children }: { kicker: string; title: string; children?: Snippet } = $props();
</script>

<header>
	<p class="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">{kicker}</p>
	<h1 class="font-display mt-1 text-4xl tracking-tight">{title}</h1>
	{#if children}
		<p class="text-muted-foreground mt-2 text-sm">{@render children()}</p>
	{/if}
</header>
