<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RestTimer from '$lib/components/exercise/RestTimer.svelte';
	import ScreenHeader from '$lib/components/exercise/ScreenHeader.svelte';
	import SessionExercise from '$lib/components/exercise/SessionExercise.svelte';
	import {
		elapsedSeconds,
		formatDuration,
		setsDone,
		workoutSetsDone,
		workoutSetsPlanned
	} from '$lib/domain/workout';
	import { tend } from '$lib/state/tend.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ProgressBar from '$lib/ui/ProgressBar.svelte';

	let now = $state(Date.now());
	let restStartedAt = $state<number | null>(null);

	const workout = $derived(tend.activeWorkout);
	const exercise = $derived(tend.currentExercise);
	const done = $derived(exercise ? setsDone(exercise.sets) : 0);
	const planned = $derived(exercise ? exercise.sets.length : 0);
	const onLastExercise = $derived(
		workout !== null && workout.exerciseIndex + 1 >= workout.exercises.length
	);
	const nextLabel = $derived(
		done < planned ? `Log set ${done + 1}` : onLastExercise ? 'Finish session' : 'Next exercise'
	);

	// The clock is read from `startedAt`, never counted, so this only has to keep
	// the reading fresh.
	$effect(() => {
		if (!workout) return;
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});

	function finish() {
		// Nothing ticked means nothing filed, and so nothing to show.
		const filed = tend.finishWorkout();
		if (!filed) {
			void goto(resolve('/exercise'));
			return;
		}
		void goto(resolve('/exercise/session/summary'));
	}

	function next() {
		if (!exercise) return;
		if (done < planned) {
			tend.toggleSet(exercise.sets.findIndex((s) => !s.done));
			restStartedAt = Date.now();
			return;
		}
		if (onLastExercise) {
			finish();
			return;
		}
		tend.nextExercise();
		restStartedAt = null;
	}
</script>

<svelte:head>
	<title>Session · Fit_</title>
</svelte:head>

{#if workout}
	<div class="flex flex-col gap-5 pb-4">
		<div>
			<ScreenHeader back="/exercise" backLabel="Leave session" title={workout.routineName}>
				{#snippet action()}
					<Button variant="outline" size="sm" onclick={finish}>Finish</Button>
				{/snippet}
			</ScreenHeader>
			<p class="tabular text-muted-foreground pl-11 text-xs">
				{formatDuration(elapsedSeconds(workout, now))} · set {Math.min(done + 1, planned)} of {planned}
			</p>
			<ProgressBar
				class="mt-2.5"
				value={workoutSetsDone(workout)}
				target={workoutSetsPlanned(workout)}
			/>
		</div>

		<SessionExercise onlog={() => (restStartedAt = Date.now())} />

		<div class="bg-background sticky bottom-0 flex flex-col gap-2 pt-2 pb-3">
			<RestTimer startedAt={restStartedAt} />
			<Button size="lg" class="w-full rounded-2xl" onclick={next}>{nextLabel}</Button>
		</div>
	</div>
{:else}
	<div class="bg-card flex flex-col items-center gap-3 rounded-3xl px-5 py-10 text-center">
		<h1 class="font-display text-xl tracking-tight">No session running</h1>
		<p class="text-muted-foreground max-w-xs text-sm">
			Start one from a routine and it will pick up here.
		</p>
		<a
			href={resolve('/exercise')}
			class="bg-primary text-primary-foreground flex h-11 items-center justify-center rounded-xl px-4 text-sm font-medium"
		>
			Back to Exercise
		</a>
	</div>
{/if}
