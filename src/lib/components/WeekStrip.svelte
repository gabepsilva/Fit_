<script lang="ts">
	import Dumbbell from '@lucide/svelte/icons/dumbbell';
	import Utensils from '@lucide/svelte/icons/utensils';
	import Weight from '@lucide/svelte/icons/weight';
	import { loggedMarksText } from '$lib/domain/week-strip';
	import { lastNDates, todayISO, weekdayShort } from '$lib/domain/utils';
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
	const days = lastNDates(7, today);

	function markClass(isSelected: boolean, has: boolean) {
		return cn(
			has
				? isSelected
					? 'text-primary-foreground'
					: 'text-primary'
				: isSelected
					? 'text-primary-foreground/30'
					: 'text-border'
		);
	}
</script>

<div class="flex gap-1.5">
	{#each days as iso (iso)}
		{@const isSelected = iso === selected}
		{@const hasFood = food.has(iso)}
		{@const hasExercise = exercise.has(iso)}
		{@const hasWeight = weight.has(iso)}
		<ToggleButton
			pressed={isSelected}
			onclick={() => (selected = iso)}
			resting="bg-card text-foreground"
			class="flex h-16 flex-1 flex-col items-center justify-center gap-1 rounded-2xl transition-colors duration-150"
		>
			<span class={cn('text-xs', isSelected ? 'opacity-80' : 'text-muted-foreground')}>
				{iso === today ? 'Today' : weekdayShort(iso)}
			</span>
			<span class="flex gap-1">
				<Utensils
					aria-hidden="true"
					size={12}
					class={cn('size-3', markClass(isSelected, hasFood))}
				/>
				<Dumbbell
					aria-hidden="true"
					size={12}
					class={cn('size-3', markClass(isSelected, hasExercise))}
				/>
				<Weight
					aria-hidden="true"
					size={12}
					class={cn('size-3', markClass(isSelected, hasWeight))}
				/>
			</span>
			<span class="sr-only">{loggedMarksText(hasFood, hasExercise, hasWeight)}</span>
		</ToggleButton>
	{/each}
</div>
