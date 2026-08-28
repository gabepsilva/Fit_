<script lang="ts">
	import { lastNDates, todayISO, weekdayShort } from '$lib/domain/utils';
	import { cn } from '$lib/ui/cn';
	import ToggleButton from '$lib/ui/ToggleButton.svelte';

	let { logged, selected = $bindable() }: { logged: Set<string>; selected: string } = $props();

	const today = todayISO();
	const days = lastNDates(7, today);
</script>

<div class="flex gap-1.5">
	{#each days as iso (iso)}
		{@const isSelected = iso === selected}
		{@const has = logged.has(iso)}
		<ToggleButton
			pressed={isSelected}
			onclick={() => (selected = iso)}
			class="bg-card text-foreground flex h-16 flex-1 flex-col items-center justify-center gap-1 rounded-2xl transition-colors duration-150"
		>
			<span class={cn('text-xs', isSelected ? 'opacity-80' : 'text-muted-foreground')}>
				{iso === today ? 'Today' : weekdayShort(iso)}
			</span>
			<span
				class={cn(
					'size-2 rounded-full',
					has
						? isSelected
							? 'bg-primary-foreground'
							: 'bg-primary'
						: isSelected
							? 'bg-primary-foreground/30'
							: 'bg-border'
				)}
			></span>
		</ToggleButton>
	{/each}
</div>
