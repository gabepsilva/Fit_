<script lang="ts">
	import { WEEKDAYS, type CalendarWeek } from '$lib/domain/training-plan';
	import type { PlannedWeek } from '$lib/domain/types';
	import { cn } from '$lib/ui/cn';
	import { plannedOption, type PlanOption } from './plan-options';

	// The whole row is the control: a week names one routine, so there is nothing to choose within it.
	let {
		week,
		options,
		plan,
		year,
		onpick
	}: {
		week: CalendarWeek;
		options: PlanOption[];
		plan: PlannedWeek[];
		year: number;
		onpick: () => void;
	} = $props();

	const option = $derived(plannedOption(options, plan, year, week.week));
</script>

<section class={cn('shadow-border overflow-hidden rounded-3xl', option?.tone.tint ?? 'bg-card')}>
	<button type="button" onclick={onpick} class="block w-full p-4 text-left">
		<span class="flex items-center gap-3">
			<span class="min-w-0 flex-1">
				<span class="block text-[15px] font-medium">Week {week.week}</span>
				<span class="text-foreground/70 block text-xs">{week.label}</span>
			</span>
			<span
				class={cn(
					'flex-none rounded-full px-2.5 py-1 text-[11.5px] font-medium',
					option?.tone.solid ?? 'bg-secondary text-foreground/70'
				)}
			>
				{option?.name ?? 'Unassigned'}
			</span>
		</span>
		<span class="mt-2.5 flex gap-1" aria-hidden="true">
			{#each WEEKDAYS as day, index (day)}
				<span
					class={cn(
						'flex h-7 flex-1 items-center justify-center rounded-lg text-[11px] font-medium',
						option?.days.includes(index)
							? option.tone.solid
							: 'bg-secondary/60 text-muted-foreground'
					)}
				>
					{day.charAt(0)}
				</span>
			{/each}
		</span>
	</button>
</section>
