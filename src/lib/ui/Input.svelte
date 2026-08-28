<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from '$lib/ui/cn';

	let {
		value = $bindable(),
		class: className,
		...rest
	}: Omit<HTMLInputAttributes, 'value'> & { value?: string | number } = $props();
</script>

<input
	bind:value
	{...rest}
	class={cn(
		'border-input bg-card text-foreground placeholder:text-ink-subtle focus-visible:ring-ring flex h-11 w-full rounded-xl border px-3 text-base shadow-border outline-none focus-visible:ring-2',
		className
	)}
/>
