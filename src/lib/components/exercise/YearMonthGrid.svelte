<script lang="ts">
	import { MONTHS_LONG, WEEKDAYS, type CalendarWeek } from '$lib/domain/training-plan';
	import type { PlannedWeek } from '$lib/domain/types';
	import { cn } from '$lib/ui/cn';
	import { plannedOption, type PlanOption } from './plan-options';

	/**
	 * The whole training year at once, a month to a block and a week to a chip.
	 * At this size a week can only carry its routine's initial and color, so the
	 * legend above the grid is what makes the colors mean anything.
	 */
	let {
		weeks,
		options,
		plan,
		year,
		onpick
	}: {
		weeks: CalendarWeek[];
		options: PlanOption[];
		plan: PlannedWeek[];
		year: number;
		onpick: (week: CalendarWeek) => void;
	} = $props();
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap gap-x-3.5 gap-y-1.5 px-1">
		{#each options as option (option.id)}
			<span class="text-muted-foreground flex items-center gap-1.5 text-[11.5px]">
				<span class={cn('size-2 rounded-xs', option.tone.solid)}></span>
				{option.name}
			</span>
		{/each}
	</div>
	<div class="grid grid-cols-2 gap-x-2.5 gap-y-3">
		{#each MONTHS_LONG as name, month (name)}
			<section class="bg-card shadow-border rounded-2xl p-2">
				<p
					class="text-muted-foreground mb-1.5 ml-0.5 text-[0.65rem] font-medium tracking-[0.14em] uppercase"
				>
					{name.slice(0, 3)}
				</p>
				<div class="flex flex-col gap-1">
					{#each weeks.filter((week) => week.month === month) as week (week.week)}
						{@const option = plannedOption(options, plan, year, week.week)}
						<button
							type="button"
							onclick={() => onpick(week)}
							aria-label={`Week ${week.week}, ${option?.name ?? 'unassigned'}`}
							class={cn(
								'flex h-5 w-full items-center gap-1.5 rounded-md px-1',
								option?.tone.tint ?? 'hover:bg-secondary'
							)}
						>
							<span
								class={cn(
									'w-2 text-left text-[9px] font-semibold',
									option?.tone.ink ?? 'text-border'
								)}
							>
								{option?.letter ?? '·'}
							</span>
							<span class="flex flex-1 gap-0.5">
								{#each WEEKDAYS as day, index (day)}
									<span
										class={cn(
											'h-1 flex-1 rounded-xs',
											option?.days.includes(index) ? option.tone.solid : 'bg-border'
										)}
									></span>
								{/each}
							</span>
						</button>
					{/each}
				</div>
			</section>
		{/each}
	</div>
</div>
