<script lang="ts">
	import { resolve } from '$app/paths';
	import { plannedRoutineId, trainingDays, WEEKDAYS, weekOf } from '$lib/domain/training-plan';
	import type { PlannedWeek, Routine, Workout } from '$lib/domain/types';
	import { addDaysISO, startOfWeek } from '$lib/domain/utils';
	import { countsAsTraining } from '$lib/domain/workout';
	import SectionLabel from '$lib/components/SectionLabel.svelte';
	import { routineLetter, routineTone } from '$lib/components/exercise/routine-tone';
	import { cn } from '$lib/ui/cn';

	/**
	 * The week as the plan drew it: which days this week's routine falls on, and
	 * which of the days already gone actually happened. Nothing here edits the
	 * week — every cell leads to the planner, which is where a week is changed.
	 */
	let {
		routines,
		plan,
		workouts,
		today
	}: {
		routines: Routine[];
		plan: PlannedWeek[];
		/** Filed workouts; the unfinished one has not happened yet. */
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
			const isToday = iso === today;
			const letter = planned.days.includes(i) ? planned.letter : null;
			// A session filed with nothing ticked is not a trained day: showing up
			// earns a sentence on the summary, not a mark on the week.
			const done = iso < today && workouts.some((w) => w.date === iso && countsAsTraining(w));
			const name = isToday ? 'Today' : label;
			return {
				iso,
				label: name,
				isToday,
				letter,
				done,
				// The cell shows a weekday, a letter and a dot, none of which reads
				// aloud as anything. This is what those three say. The routine is
				// named once, above the strip, rather than seven times inside it.
				description: `${name}, ${letter ? 'training day' : 'rest day'}${done ? ', trained' : ''}`
			};
		});
	});
</script>

<div>
	<div class="flex items-baseline justify-between px-1 pb-2">
		<SectionLabel>This week</SectionLabel>
		<a href={resolve('/exercise/plan')} class="text-muted-foreground text-xs">Edit plan</a>
	</div>
	<div class="flex gap-1.5">
		{#each days as day (day.iso)}
			<a
				href={resolve('/exercise/plan')}
				aria-label={day.description}
				class={cn(
					'flex h-16 flex-1 flex-col items-center justify-center gap-1 rounded-2xl',
					'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
					day.isToday
						? 'bg-primary text-primary-foreground'
						: 'bg-card text-foreground hover:bg-secondary shadow-border'
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
						day.done
							? 'bg-primary'
							: day.isToday
								? 'bg-primary-foreground/50'
								: day.letter
									? ['border-[1.5px]', planned.tone.dot]
									: 'bg-border'
					)}
				></span>
			</a>
		{/each}
	</div>
</div>
