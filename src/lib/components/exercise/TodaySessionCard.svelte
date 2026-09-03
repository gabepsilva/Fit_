<script lang="ts">
	import List from '@lucide/svelte/icons/list';
	import { resolve } from '$app/paths';
	import { routineTotals } from '$lib/domain/exercises';
	import { plannedRoutineId, trainingDays, weekOf, weekdayIndex } from '$lib/domain/training-plan';
	import type { PlannedWeek, Routine, Workout } from '$lib/domain/types';
	import { startOfWeek } from '$lib/domain/utils';
	import { countsAsTraining } from '$lib/domain/workout';
	import SectionLabel from '$lib/components/SectionLabel.svelte';
	import Button from '$lib/ui/Button.svelte';

	/**
	 * What today asks for is decided by the plan, not a picker: the week names a
	 * routine and its frequency decides which days it lands on. Days it skips are
	 * rest days; with no routines at all the card says so.
	 */
	let {
		routines,
		plan,
		workouts,
		today,
		onstart,
		onpick,
		onopen
	}: {
		routines: Routine[];
		plan: PlannedWeek[];
		/** Filed workouts, so a rest day can say what the week already holds. */
		workouts: Workout[];
		today: string;
		onstart: (routineId: string) => void;
		/** Opens the shelf of starter routines. */
		onpick: () => void;
		/** Opens a blank routine in the builder. */
		onopen: () => void;
	} = $props();

	/**
	 * "Has history, no routines left" — unreachable until `tend.removeRoutine`
	 * exists and something calls it. First run (no routines, no history) is a
	 * different branch and shows the template shelf instead.
	 */
	const nothingYet = $derived(routines.length === 0);

	const planned = $derived.by(() => {
		const { year, week } = weekOf(today);
		return routines.find((r) => r.id === plannedRoutineId(plan, year, week));
	});

	const routine = $derived(
		planned && trainingDays(planned.freq).includes(weekdayIndex(today)) ? planned : undefined
	);

	/** Training anyway on a rest day trains this week's routine, or the first one. */
	const anyway = $derived(planned ?? routines[0]);

	/**
	 * `startWorkout` refuses a routine with no movements, so its run control is
	 * disabled rather than left looking live.
	 */
	function runnable(r: Routine | undefined) {
		return r !== undefined && r.exercises.length > 0;
	}

	/**
	 * Sessions actually trained this week; one walked out of with nothing ticked
	 * doesn't count.
	 */
	const doneThisWeek = $derived(
		workouts.filter((w) => w.date >= startOfWeek(today) && w.date <= today && countsAsTraining(w))
			.length
	);

	const restMeta = $derived.by(() => {
		const scheduled = 'The calendar has nothing scheduled.';
		if (doneThisWeek === 0) return scheduled;
		const sessions = doneThisWeek === 1 ? 'session' : 'sessions';
		return `${scheduled} ${doneThisWeek} ${sessions} done this week already.`;
	});

	const head = $derived.by(() => {
		if (nothingYet)
			return {
				kicker: 'Today',
				title: 'No routines yet',
				meta: 'A routine is the list of exercises for one session. Start from a template, or build your own.'
			};
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
	<SectionLabel>{head.kicker}</SectionLabel>
	<h2 class="font-display mt-1.5 text-2xl tracking-tight">{head.title}</h2>
	<p class="text-muted-foreground mt-2 text-sm">{head.meta}</p>

	{#if nothingYet}
		<div class="mt-4 flex gap-2">
			<Button size="lg" class="flex-1" onclick={onpick}>Pick a starter</Button>
			<Button variant="outline" size="lg" class="shrink-0" onclick={onopen}>Build one</Button>
		</div>
	{:else if routine}
		<div class="mt-3.5 flex flex-wrap gap-1.5">
			<!-- Keyed by position, not name: the same movement can appear twice, and duplicate keys are a runtime error. -->
			{#each routine.exercises.slice(0, 4) as exercise, index (index)}
				<span class="bg-secondary text-foreground/70 rounded-full px-2.5 py-1 text-xs">
					{exercise.name}
				</span>
			{/each}
		</div>
		<div class="mt-4 flex gap-2">
			<Button
				size="lg"
				class="flex-1"
				disabled={!runnable(routine)}
				onclick={() => onstart(routine.id)}
			>
				Start session
			</Button>
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
				disabled={!runnable(anyway)}
				onclick={() => anyway && onstart(anyway.id)}
			>
				Train anyway
			</Button>
		</div>
	{/if}
</section>
