<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import BuilderExerciseRow from '$lib/components/exercise/BuilderExerciseRow.svelte';
	import LibrarySheet from '$lib/components/exercise/LibrarySheet.svelte';
	import ScreenHeader from '$lib/components/exercise/ScreenHeader.svelte';
	import { routineTotals } from '$lib/domain/exercises';
	import { tend } from '$lib/state/tend.svelte';
	import Input from '$lib/ui/Input.svelte';
	import ToggleButton from '$lib/ui/ToggleButton.svelte';

	const FREQUENCIES = [1, 2, 3, 4, 5, 6];
	const LABEL =
		'text-muted-foreground px-1 text-[0.625rem] font-medium tracking-[0.14em] uppercase';

	const id = $derived(page.params.id ?? '');
	const routine = $derived(tend.routine(id));
	const home = resolve('/exercise');

	let libraryOpen = $state(false);
</script>

<svelte:head>
	<title>Edit routine · Fit_</title>
</svelte:head>

{#if routine}
	{@const totals = routineTotals(routine)}
	<!-- "Save" only leaves: every edit below is written to the store as it is made. -->
	{#snippet save()}
		<a
			href={home}
			class="bg-primary text-primary-foreground flex h-9 shrink-0 items-center rounded-xl px-4 text-sm"
		>
			Save
		</a>
	{/snippet}

	<div class="flex flex-col gap-6">
		<ScreenHeader
			back="/exercise"
			backLabel="Back to Exercise"
			title="Edit routine"
			action={save}
		/>

		<section class="flex flex-col gap-2">
			<p class={LABEL}>Name</p>
			<Input
				aria-label="Routine name"
				bind:value={
					() => routine.name, (name) => tend.updateRoutine(id, { name: String(name ?? '') })
				}
				class="font-display h-14 rounded-2xl text-xl tracking-tight"
			/>
			<p class="text-muted-foreground px-1 text-sm">
				{totals.exercises} exercises · {totals.sets} sets · about {totals.minutes} min
			</p>
		</section>

		<section class="flex flex-col gap-2">
			<p class={LABEL}>Days a week</p>
			<div class="flex gap-1.5">
				{#each FREQUENCIES as freq (freq)}
					<ToggleButton
						pressed={routine.freq === freq}
						onclick={() => tend.updateRoutine(id, { freq })}
						class="border-border text-muted-foreground h-11 flex-1 rounded-2xl border font-medium"
					>
						{freq}×
					</ToggleButton>
				{/each}
			</div>
			<p class="text-muted-foreground px-1 text-sm">
				{routine.freq} sessions a week · roughly every {routine.freq >= 3 ? '2' : '3'} days
			</p>
		</section>

		<section class="flex flex-col gap-2">
			<div class="flex items-baseline justify-between">
				<p class={LABEL}>Exercises</p>
				<span class="text-muted-foreground px-1 text-xs">tap ↑ to reorder</span>
			</div>
			{#if routine.exercises.length > 0}
				<ul class="flex flex-col gap-2">
					{#each routine.exercises as exercise, index (index)}
						<BuilderExerciseRow
							{index}
							{exercise}
							onmoveup={() => tend.moveExerciseUp(id, index)}
							onremove={() => tend.removeExercise(id, index)}
							onbump={(field: 'sets' | 'reps', direction: number) =>
								tend.bumpRoutineExercise(id, index, field, direction)}
						/>
					{/each}
				</ul>
			{:else}
				<p
					class="text-muted-foreground bg-card rounded-3xl px-5 py-8 text-center text-sm shadow-border"
				>
					Nothing on this routine yet. Pick the movements it should ask for.
				</p>
			{/if}
			<button
				type="button"
				onclick={() => (libraryOpen = true)}
				class="border-border text-muted-foreground h-12 w-full rounded-2xl border border-dashed text-sm"
			>
				+ Add from library
			</button>
		</section>
	</div>

	<LibrarySheet
		bind:open={libraryOpen}
		routineName={routine.name}
		taken={routine.exercises.map((e) => e.name)}
		onadd={(names: string[]) => tend.addExercises(id, names)}
		onclose={() => (libraryOpen = false)}
	/>
{:else}
	<div class="flex flex-col gap-4">
		<ScreenHeader back="/exercise" backLabel="Back to Exercise" title="Edit routine" />
		<p class="text-muted-foreground px-1 text-sm">That routine is gone.</p>
		<a href={home} class="text-primary px-1 text-sm underline">Back to Exercise</a>
	</div>
{/if}
