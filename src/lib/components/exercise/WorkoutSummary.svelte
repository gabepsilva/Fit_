<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatLoad } from '$lib/domain/exercises';
	import type { WorkoutSet } from '$lib/domain/types';
	import {
		elapsedSeconds,
		formatDuration,
		setsDone,
		workoutSetsDone,
		workoutVolume
	} from '$lib/domain/workout';
	import { tend } from '$lib/state/tend.svelte';

	/**
	 * What you just did, read back once. The newest filed workout is the one on
	 * screen: the session screen files it and then comes here, and a session
	 * where nothing was ticked is never filed at all.
	 */
	const workout = $derived(tend.state.workouts.at(-1) ?? null);

	const stats = $derived(
		workout
			? [
					{ key: 'Duration', value: formatDuration(elapsedSeconds(workout, Date.now())) },
					{ key: 'Sets done', value: String(workoutSetsDone(workout)) },
					{ key: 'Volume', value: `${Math.round(workoutVolume(workout))} kg` }
				]
			: []
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

	const ACTION = 'flex w-full items-center justify-center rounded-2xl font-medium';
</script>

{#if workout}
	<div class="flex flex-col gap-5 pb-10">
		<header>
			<p class="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
				Session done
			</p>
			<h1 class="font-display mt-1.5 text-4xl leading-tight tracking-tight">
				{workout.routineName}
			</h1>
			<p class="text-muted-foreground mt-2.5 text-sm leading-relaxed">
				Logged and filed. Nothing else to do.
			</p>
		</header>

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
				{#each workout.exercises as exercise (exercise.name)}
					<div class="flex items-baseline gap-2.5">
						<span class="min-w-0 flex-1 truncate text-sm">{exercise.name}</span>
						<span class="tabular text-muted-foreground text-sm">{detail(exercise.sets)}</span>
					</div>
				{/each}
			</div>
		</section>

		<div class="mt-2 flex flex-col gap-2">
			<a href={resolve('/exercise/progress')} class="{ACTION} border-border h-12 border text-sm">
				See training progress
			</a>
			<a href={resolve('/exercise')} class="{ACTION} bg-primary text-primary-foreground h-13">
				Done
			</a>
		</div>
	</div>
{:else}
	<div class="bg-card flex flex-col items-center gap-3 rounded-3xl px-5 py-10 text-center">
		<h1 class="font-display text-xl tracking-tight">Nothing filed yet</h1>
		<p class="text-muted-foreground max-w-xs text-sm">
			A session shows up here once you have finished one.
		</p>
		<a href={resolve('/exercise')} class="{ACTION} bg-primary text-primary-foreground h-11 px-4">
			Back to Exercise
		</a>
	</div>
{/if}
