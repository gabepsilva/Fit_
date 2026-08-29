<script lang="ts">
	import SectionLabel from '$lib/components/SectionLabel.svelte';
	import { cn } from '$lib/ui/cn';
	import type { PlanOption } from './plan-options';

	/**
	 * The brush: which routine the next tap on a week will paint it with. It
	 * chooses nothing on its own, so the month planner stays a screen where every
	 * change is a deliberate tap.
	 */
	let {
		options,
		selected,
		onpick
	}: {
		options: PlanOption[];
		selected: string;
		onpick: (id: string) => void;
	} = $props();
</script>

<section class="bg-card shadow-border rounded-3xl p-4">
	<SectionLabel class="mb-2">Series to apply</SectionLabel>
	<div class="flex flex-wrap gap-1.5">
		{#each options as option (option.id)}
			{@const on = option.id === selected}
			<button
				type="button"
				aria-pressed={on}
				onclick={() => onpick(option.id)}
				class={cn(
					'flex h-9 items-center gap-2 rounded-full px-3.5 text-sm',
					on ? option.tone.solid : 'border-border text-muted-foreground border'
				)}
			>
				<span class={cn('size-2 rounded-xs', on ? 'bg-current' : option.tone.solid)}></span>
				{option.name}
			</button>
		{/each}
	</div>
</section>
