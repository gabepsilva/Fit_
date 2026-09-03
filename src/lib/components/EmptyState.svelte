<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		children,
		action
	}: {
		/** Omit where the screen already carries its own heading. */
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
