<script lang="ts">
	import { resolve } from '$app/paths';
	import { plannedRoutineId, trainingDays, WEEKDAYS, weekOf } from '$lib/domain/training-plan';
	import type { PlannedWeek, Routine, Workout } from '$lib/domain/types';
	import { addDaysISO, startOfWeek } from '$lib/domain/utils';
	import { routineLetter, routineTone } from '$lib/components/exercise/routine-tone';
	import { cn } from '$lib/ui/cn';

	/**
	 * The week as the plan drew it: which days this week's routine falls on, and
	 * which of the days already gone actually happened. Read-only on purpose —
	 * changing the week is the planner's job, and the header goes there.
	 */
	let {
		routines,
		plan,
		workouts,
		today
	}: {
		routines: Routine[];
		plan: PlannedWeek[];
		/** Finished workouts; the unfinished one has not happened yet. */
		workouts: Workout[];
		today: string;
	} = $props();

	const planned = $derived.by(() => {
		const { year, week } = weekOf(today);
		const index = routines.findIndex((r) => r.id === plannedRoutineId(plan, year, week));
		const routine = routines[index];
		return {
			letter: routine ? routineLetter(routine.name) : null,
			days: routine ? trainingDays(routine.freq) : [],
			tone: routineTone(index)
		};
	});

	const days = $derived.by(() => {
		const monday = startOfWeek(today);
		return WEEKDAYS.map((label, i) => {
			const iso = addDaysISO(monday, i);
			return {
				iso,
				label: iso === today ? 'Today' : label,
				isToday: iso === today,
				letter: planned.days.includes(i) ? planned.letter : null,
				done: iso < today && workouts.some((w) => w.date === iso)
			};
		});
	});
</script>

<div>
	<div class="flex items-baseline justify-between px-1 pb-2">
		<p class="text-muted-foreground text-[0.65rem] font-medium tracking-[0.14em] uppercase">
			This week
		</p>
		<a href={resolve('/exercise/plan')} class="text-muted-foreground text-xs">Edit plan</a>
	</div>
	<div class="flex gap-1.5">
		{#each days as day (day.iso)}
			<div
				class={cn(
					'flex h-16 flex-1 flex-col items-center justify-center gap-1 rounded-2xl',
					day.isToday
						? 'bg-primary text-primary-foreground'
						: 'bg-card text-foreground shadow-border'
				)}
			>
				<span class="text-xs opacity-85">{day.label}</span>
				<span
					class={cn(
						'text-[0.65rem] font-semibold',
						day.isToday ? 'opacity-90' : day.letter ? planned.tone.ink : 'text-muted-foreground'
					)}
				>
					{day.letter ?? '·'}
				</span>
				<span
					class={cn(
						'size-1.5 rounded-full',
						day.done ? 'bg-primary' : day.isToday ? 'bg-primary-foreground/30' : 'bg-border'
					)}
				></span>
			</div>
		{/each}
	</div>
</div>
