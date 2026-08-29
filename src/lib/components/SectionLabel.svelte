<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/ui/cn';

	/**
	 * The small upper-case label over a block: "Routines", "Days a week". One
	 * definition, because five hand-typed copies had drifted into three type
	 * sizes and two letter-spacings for what the design draws once.
	 */
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
