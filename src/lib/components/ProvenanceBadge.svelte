<script lang="ts">
	import { PROVENANCE_LABEL } from '$lib/domain/foods';
	import type { Provenance } from '$lib/domain/types';
	import { cn } from '$lib/ui/cn';

	let { provenance }: { provenance?: Provenance | undefined } = $props();

	const meta = $derived(provenance ? PROVENANCE_LABEL[provenance] : null);
</script>

{#if meta}
	<span
		title={meta.detail}
		class={cn(
			'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tracking-wide uppercase',
			provenance === 'usda' || provenance === 'lab'
				? 'bg-accent text-accent-foreground'
				: provenance === 'off'
					? 'bg-secondary text-muted-foreground'
					: 'bg-linen text-muted-foreground'
		)}
	>
		{meta.title}
	</span>
{/if}
