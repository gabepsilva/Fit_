<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import RestTimer from '$lib/components/exercise/RestTimer.svelte';
	import ScreenHeader from '$lib/components/exercise/ScreenHeader.svelte';
	import SessionExercise from '$lib/components/exercise/SessionExercise.svelte';
	import {
		elapsedSeconds,
		formatDuration,
		workoutSetsDone,
		workoutSetsPlanned
	} from '$lib/domain/workout';
	import { tend } from '$lib/state/tend.svelte';
	import Button from '$lib/ui/Button.svelte';
	import LinkButton from '$lib/ui/LinkButton.svelte';
	import ProgressBar from '$lib/ui/ProgressBar.svelte';

	let now = $state(Date.now());
	let restStartedAt = $state<number | null>(null);

	const workout = $derived(tend.state.activeWorkout);
	const exercise = $derived(tend.currentExercise);
	const planned = $derived(exercise ? exercise.sets.length : 0);
	const onLastExercise = $derived(
		workout !== null && workout.exerciseIndex + 1 >= workout.exercises.length
	);
	// The set the button will actually tick: the first one still open, which is
	// not "however many are done, plus one" once a later set has been ticked out
	// of order.
	const nextSetIndex = $derived(exercise ? exercise.sets.findIndex((s) => !s.done) : -1);
	const setNumber = $derived(Math.min(nextSetIndex === -1 ? planned : nextSetIndex + 1, planned));
	const nextLabel = $derived(
		nextSetIndex !== -1
			? `Log set ${nextSetIndex + 1}`
			: onLastExercise
				? 'Finish session'
				: 'Next exercise'
	);

	// The clock is read from `startedAt`, never counted, so this only has to keep
	// the reading fresh. It hangs off whether a session is running rather than off
	// the workout itself: a tick or a stepper must not tear the interval down and
	// start the second over.
	const live = $derived(workout !== null);
	$effect(() => {
		if (!live) return;
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});

	function finish() {
		// Every session that was running gets filed, ticked or not, and the summary
		// has words for an empty one. Only "no session at all" has nothing to show.
		const filed = tend.finishWorkout();
		void goto(resolve(filed ? '/exercise/session/summary' : '/exercise'));
	}

	function next() {
		if (!exercise) return;
		if (nextSetIndex !== -1) {
			tend.toggleSet(nextSetIndex);
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
				{formatDuration(elapsedSeconds(workout, now))} · set {setNumber} of {planned}
			</p>
			<ProgressBar
				class="mt-2.5"
				value={workoutSetsDone(workout)}
				target={workoutSetsPlanned(workout)}
			/>
		</div>

		<SessionExercise onlog={() => (restStartedAt = Date.now())} />

		<div class="bg-background sticky bottom-0 flex flex-col gap-2 pt-2 pb-3">
			<RestTimer startedAt={restStartedAt} seconds={tend.state.restSeconds} />
			<Button size="lg" class="w-full rounded-2xl" onclick={next}>{nextLabel}</Button>
		</div>
	</div>
{:else}
	<EmptyState title="No session running">
		Start one from a routine and it will pick up here.
		{#snippet action()}
			<LinkButton href={resolve('/exercise')}>Back to Exercise</LinkButton>
		{/snippet}
	</EmptyState>
{/if}
