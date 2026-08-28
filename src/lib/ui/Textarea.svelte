<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { cn } from '$lib/ui/cn';

	let {
		value = $bindable(),
		class: className,
		...rest
	}: Omit<HTMLTextareaAttributes, 'value'> & { value?: string } = $props();
</script>

<textarea
	bind:value
	{...rest}
	class={cn(
		'border-input bg-card text-foreground placeholder:text-ink-subtle focus-visible:ring-ring flex min-h-24 w-full rounded-2xl border px-3 py-3 text-base shadow-[var(--shadow-border)] outline-none focus-visible:ring-2',
		className
	)}></textarea>
