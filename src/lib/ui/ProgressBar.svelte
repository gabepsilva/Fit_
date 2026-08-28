<script lang="ts">
	import { cn } from '$lib/ui/cn';

	/**
	 * How far along a value is toward its target. Decoration for the reading
	 * beside it, so it carries no label of its own and stays out of the
	 * accessibility tree.
	 */
	let {
		value,
		target,
		class: className
	}: { value: number; target: number; class?: string | undefined } = $props();

	// A target of zero would divide by zero; an empty bar is the honest answer.
	const pct = $derived(target > 0 ? Math.min(100, (value / target) * 100) : 0);
	const barStyle = $derived(`width: ${pct}%`);
</script>

<div aria-hidden="true" class={cn('bg-secondary h-1.5 overflow-hidden rounded-full', className)}>
	<div class="bg-primary h-full rounded-full" style={barStyle}></div>
</div>
