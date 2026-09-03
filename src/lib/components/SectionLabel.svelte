<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/ui/cn';

	let { class: className, children }: { class?: string | undefined; children: Snippet } = $props();
</script>

<p
	class={cn(
		'text-muted-foreground text-[0.65rem] font-medium tracking-[0.14em] uppercase',
		className
	)}
>
	{@render children()}
</p>
