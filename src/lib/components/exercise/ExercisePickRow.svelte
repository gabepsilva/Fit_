<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import CirclePlay from '@lucide/svelte/icons/circle-play';
	import { cn } from '$lib/ui/cn';

	/**
	 * One movement offered from the library while building a routine. Picking is
	 * a selection that accumulates, so the row is a checkbox and stays ticked.
	 */
	let {
		name,
		note,
		selected,
		onpick,
		onplay
	}: {
		name: string;
		note: string;
		selected: boolean;
		onpick: () => void;
		/** Shows the form-check control when provided. */
		onplay?: (() => void) | undefined;
	} = $props();
</script>

<div
	class={cn(
		'flex items-center gap-3 rounded-2xl px-3',
		selected ? 'bg-accent/60' : 'bg-transparent'
	)}
>
	<button
		type="button"
		role="checkbox"
		aria-checked={selected}
		aria-label={`Select ${name}`}
		onclick={onpick}
		class={cn(
			'flex size-8 shrink-0 items-center justify-center rounded-xl',
			selected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground/70'
		)}
	>
		<Check class="size-3.5" />
	</button>
	<span class="min-w-0 flex-1 py-3">
		<span class="block truncate text-sm font-medium">{name}</span>
		<span class="text-muted-foreground block text-xs">{note}</span>
	</span>
	{#if onplay}
		<button
			type="button"
			onclick={onplay}
			aria-label={`Watch ${name}`}
			class="text-muted-foreground hover:bg-secondary flex size-9 shrink-0 items-center justify-center rounded-xl"
		>
			<CirclePlay class="size-4" />
		</button>
	{/if}
</div>
