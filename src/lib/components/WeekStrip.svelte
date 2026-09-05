<script lang="ts">
	import Dumbbell from '@lucide/svelte/icons/dumbbell';
	import Utensils from '@lucide/svelte/icons/utensils';
	import Weight from '@lucide/svelte/icons/weight';
	import { dayStripLabel, dayStripRange, loggedMarksText } from '$lib/domain/week-strip';
	import { todayISO } from '$lib/domain/utils';
	import { cn } from '$lib/ui/cn';
	import ToggleButton from '$lib/ui/ToggleButton.svelte';

	let {
		food,
		exercise,
		weight,
		selected = $bindable()
	}: {
		food: Set<string>;
		exercise: Set<string>;
		weight: Set<string>;
		selected: string;
	} = $props();

	const today = todayISO();
	const days = dayStripRange(today);

	let todayEl = $state<HTMLButtonElement>();

	$effect(() => {
		todayEl?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'instant' });
	});

	function markClass(isSelected: boolean, has: boolean) {
		return cn(
			has
				? isSelected
					? 'text-primary-foreground'
					: 'text-primary'
				: isSelected
					? 'text-primary-foreground/30'
					: 'text-muted-foreground/50'
		);
	}
</script>

<div
	class="scrollbar-none flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth px-[calc(50%-2.5rem)]"
>
	{#each days as iso (iso)}
		{@const isSelected = iso === selected}
		{@const hasFood = food.has(iso)}
		{@const hasExercise = exercise.has(iso)}
		{@const hasWeight = weight.has(iso)}
		<ToggleButton
			pressed={isSelected}
			onclick={() => (selected = iso)}
			resting="bg-card text-foreground"
			class="relative flex h-16 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 snap-center transition-colors duration-150"
			{@attach iso === today &&
				((el: HTMLButtonElement) => {
					todayEl = el;
				})}
		>
			<span class={cn('text-xs', isSelected ? 'opacity-80' : 'text-muted-foreground')}>
				{dayStripLabel(iso, today)}
			</span>
			<span class="flex items-center gap-1.5">
				<Utensils
					aria-hidden="true"
					size={16}
					stroke-width={2.25}
					class={cn('size-4 shrink-0', markClass(isSelected, hasFood))}
				/>
				<Dumbbell
					aria-hidden="true"
					size={16}
					stroke-width={2.25}
					class={cn('size-4 shrink-0', markClass(isSelected, hasExercise))}
				/>
				<Weight
					aria-hidden="true"
					size={16}
					stroke-width={2.25}
					class={cn('size-4 shrink-0', markClass(isSelected, hasWeight))}
				/>
			</span>
			<span class="sr-only">{loggedMarksText(hasFood, hasExercise, hasWeight)}</span>
		</ToggleButton>
	{/each}
</div>
