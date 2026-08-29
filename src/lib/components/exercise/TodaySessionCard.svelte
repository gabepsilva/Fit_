<script lang="ts">
	import List from '@lucide/svelte/icons/list';
	import { resolve } from '$app/paths';
	import { routineTotals } from '$lib/domain/exercises';
	import { plannedRoutineId, trainingDays, weekOf, weekdayIndex } from '$lib/domain/training-plan';
	import type { PlannedWeek, Routine, Workout } from '$lib/domain/types';
	import { startOfWeek } from '$lib/domain/utils';
	import Button from '$lib/ui/Button.svelte';

	/**
	 * What today asks for, decided by the plan rather than by a picker: the week
	 * names a routine, and the routine's frequency decides which days of that
	 * week it lands on. Every other day is a rest day, said plainly.
	 */
	let {
		routines,
		plan,
		workouts,
		today,
		onstart
	}: {
		routines: Routine[];
		plan: PlannedWeek[];
		/** Finished workouts, so a rest day can say what the week already holds. */
		workouts: Workout[];
		today: string;
		onstart: (routineId: string) => void;
	} = $props();

	const planned = $derived.by(() => {
		const { year, week } = weekOf(today);
		return routines.find((r) => r.id === plannedRoutineId(plan, year, week));
	});

	const routine = $derived(
		planned && trainingDays(planned.freq).includes(weekdayIndex(today)) ? planned : undefined
	);

	/** Training anyway on a rest day trains this week's routine, or the first one. */
	const anyway = $derived(planned ?? routines[0]);

	const doneThisWeek = $derived(
		workouts.filter((w) => w.date >= startOfWeek(today) && w.date <= today).length
	);

	const restMeta = $derived.by(() => {
		const scheduled = 'The calendar has nothing scheduled.';
		if (doneThisWeek === 0) return scheduled;
		const sessions = doneThisWeek === 1 ? 'session' : 'sessions';
		return `${scheduled} ${doneThisWeek} ${sessions} done this week already.`;
	});

	const head = $derived.by(() => {
		if (!routine) return { kicker: 'Today', title: 'Rest day', meta: restMeta };
		const totals = routineTotals(routine);
		return {
			kicker: 'Today’s session',
			title: routine.name,
			meta: `${totals.exercises} exercises · ${totals.sets} sets · about ${totals.minutes} min`
		};
	});
</script>

<section class="bg-card rounded-3xl p-4 shadow-border">
	<p class="text-muted-foreground text-[0.65rem] font-medium tracking-[0.16em] uppercase">
		{head.kicker}
	</p>
	<h2 class="font-display mt-1.5 text-2xl tracking-tight">{head.title}</h2>
	<p class="text-muted-foreground mt-2 text-sm">{head.meta}</p>

	{#if routine}
		<div class="mt-3.5 flex flex-wrap gap-1.5">
			{#each routine.exercises.slice(0, 4) as exercise (exercise.name)}
				<span class="bg-secondary text-foreground/70 rounded-full px-2.5 py-1 text-xs">
					{exercise.name}
				</span>
			{/each}
		</div>
		<div class="mt-4 flex gap-2">
			<Button size="lg" class="flex-1" onclick={() => onstart(routine.id)}>Start session</Button>
			<a
				href={resolve('/exercise/routines/[id]', { id: routine.id })}
				aria-label="See the whole routine"
				class="border-border text-foreground hover:bg-secondary flex size-12 shrink-0 items-center justify-center rounded-2xl border"
			>
				<List class="size-4" />
			</a>
		</div>
	{:else}
		<div class="mt-4 flex gap-2">
			<a
				href={resolve('/exercise/plan')}
				class="border-border text-foreground hover:bg-secondary flex h-12 flex-1 items-center justify-center rounded-2xl border text-sm"
			>
				Change the plan
			</a>
			<Button
				variant="secondary"
				size="lg"
				class="flex-1"
				disabled={!anyway}
				onclick={() => anyway && onstart(anyway.id)}
			>
				Train anyway
			</Button>
		</div>
	{/if}
</section>
