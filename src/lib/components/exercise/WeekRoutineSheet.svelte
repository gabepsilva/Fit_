<script lang="ts">
	import type { CalendarWeek } from '$lib/domain/training-plan';
	import { REST_WEEK } from '$lib/domain/types';
	import { cn } from '$lib/ui/cn';
	import Sheet from '$lib/ui/Sheet.svelte';
	import type { PlanOption } from './plan-options';

	/**
	 * What one week of the year is for. A week names a single routine rather than
	 * a day-by-day schedule, so the choice is one tap and the sheet closes on it.
	 */
	let {
		open = $bindable(false),
		week,
		year,
		options,
		current,
		onpick,
		onclose
	}: {
		open?: boolean;
		week: CalendarWeek | null;
		year: number;
		options: PlanOption[];
		/** The week's current assignment, if it has one. */
		current?: string | undefined;
		onpick: (id: string) => void;
		onclose: () => void;
	} = $props();
</script>

{#if week}
	{@const heading = `Week ${week.week}`}
	{@const when = `${week.label} · ${year}`}
	<Sheet bind:open title={heading} description={when} {onclose}>
		<div class="flex flex-col gap-2 px-5 pt-3.5 pb-6">
			{#each options as option (option.id)}
				{@const on = option.id === current}
				<button
					type="button"
					aria-pressed={on}
					onclick={() => onpick(option.id)}
					class={cn(
						'flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left',
						on ? cn(option.tone.tint, 'border-transparent') : 'border-border'
					)}
				>
					<span class={cn('size-3 flex-none rounded-xs', option.tone.solid)}></span>
					<span class="min-w-0 flex-1">
						<span class={cn('block text-[15px] font-medium', on ? '' : 'text-muted-foreground')}>
							{option.name}
						</span>
						<span class="text-foreground/70 block text-xs">
							{option.id === REST_WEEK
								? 'Nothing scheduled, on purpose.'
								: 'Every session that week'}
						</span>
					</span>
				</button>
			{/each}
		</div>
	</Sheet>
{/if}
