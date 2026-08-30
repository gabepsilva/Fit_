<script lang="ts">
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { formatLoad } from '$lib/domain/exercises';
	import { summaryNote } from '$lib/domain/training-progress';
	import type { WorkoutSet } from '$lib/domain/types';
	import { addDaysISO, todayISO } from '$lib/domain/utils';
	import {
		elapsedSeconds,
		formatDuration,
		setsDone,
		workoutSetsDone,
		workoutVolume
	} from '$lib/domain/workout';
	import { tend } from '$lib/state/tend.svelte';
	import LinkButton from '$lib/ui/LinkButton.svelte';

	/**
	 * What you just did, read back once. The newest filed workout is the one on
	 * screen: the session screen files it and then comes here, whether or not
	 * anything was ticked off in it.
	 */
	const workout = $derived(tend.state.workouts.at(-1) ?? null);

	const stats = $derived(
		workout
			? [
					{ key: 'Duration', value: formatDuration(elapsedSeconds(workout, Date.now())) },
					{ key: 'Sets done', value: String(workoutSetsDone(workout)) },
					{ key: 'Volume', value: `${Math.round(workoutVolume(workout))} ${tend.state.loadUnit}` }
				]
			: []
	);

	/**
	 * A session can be walked out of with nothing ticked, and that is worth
	 * saying out loud rather than answering with a page of zeroes.
	 */
	const line = $derived(
		workout && workoutSetsDone(workout) === 0
			? 'Nothing logged this time. Showing up counts; the numbers can wait.'
			: 'Logged and filed. Nothing else to do.'
	);

	// The same four weeks the volume card on the progress screen looks over, so
	// the note and the chart it points at cannot disagree.
	const note = $derived(
		summaryNote({
			workouts: tend.state.workouts,
			unit: tend.state.loadUnit,
			sinceISO: addDaysISO(todayISO(), -28)
		})
	);

	/**
	 * How many sets went down, and at what — the first set stands for the rest.
	 * An exercise the session never reached reads as skipped rather than as
	 * "0 × 10 @ 30", which states a prescription as though it were a result.
	 */
	function detail(sets: WorkoutSet[]) {
		const done = setsDone(sets);
		const opener = sets[0];
		if (done === 0 || !opener) return 'not done';
		return `${done} × ${opener.reps} @ ${formatLoad(opener.load)}`;
	}
</script>

{#if workout}
	<div class="flex flex-col gap-5 pb-10">
		<PageHeader kicker="Session done" title={workout.routineName}>{line}</PageHeader>

		<section class="flex gap-2">
			{#each stats as stat (stat.key)}
				<div class="bg-card flex-1 rounded-3xl px-3 py-3.5 shadow-border">
					<p class="font-display tabular text-2xl">{stat.value}</p>
					<p class="text-muted-foreground mt-1 text-xs tracking-wide uppercase">{stat.key}</p>
				</div>
			{/each}
		</section>

		<section class="bg-card rounded-3xl p-4 shadow-border">
			<h2 class="font-display text-lg tracking-tight">What you did</h2>
			<div class="mt-2.5 flex flex-col gap-2.5">
				<!-- Keyed by position, not by name: a swap may rename one movement to
				     what another already holds, and two rows keyed alike is a runtime
				     error. A filed workout's list never reorders. -->
				{#each workout.exercises as exercise, index (index)}
					<div class="flex items-baseline gap-2.5">
						<span class="min-w-0 flex-1 truncate text-sm">{exercise.name}</span>
						<span class="tabular text-muted-foreground text-sm">{detail(exercise.sets)}</span>
					</div>
				{/each}
			</div>
		</section>

		{#if note}
			<section class="bg-accent text-primary rounded-3xl p-4 text-sm leading-relaxed">
				{note}
			</section>
		{/if}

		<div class="mt-2 flex flex-col gap-2">
			<LinkButton variant="outline" size="lg" class="w-full" href={resolve('/exercise/progress')}>
				See training progress
			</LinkButton>
			<LinkButton size="lg" class="w-full" href={resolve('/exercise')}>Done</LinkButton>
		</div>
	</div>
{:else}
	<EmptyState title="Nothing filed yet">
		A session shows up here once you have finished one.
		{#snippet action()}
			<LinkButton href={resolve('/exercise')}>Back to Exercise</LinkButton>
		{/snippet}
	</EmptyState>
{/if}
