<script lang="ts">
	import type { Snippet } from 'svelte';

	// The page <title> is set by the route's own <svelte:head>, not here.
	let { kicker, title, children }: { kicker: string; title: string; children?: Snippet } = $props();
</script>

<header>
	<p class="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">{kicker}</p>
	<h1 class="font-display mt-1 text-4xl tracking-tight">{title}</h1>
	{#if children}
		<p class="text-muted-foreground mt-2 text-sm">{@render children()}</p>
	{/if}
</header>
