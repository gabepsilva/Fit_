<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLLabelAttributes } from 'svelte/elements';
	import { cn } from '$lib/ui/cn';

	let {
		class: className,
		children,
		...rest
	}: HTMLLabelAttributes & { children: Snippet } = $props();
</script>

<label {...rest} class={cn('text-muted-foreground text-sm font-medium', className)}>
	{@render children()}
</label>
