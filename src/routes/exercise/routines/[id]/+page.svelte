<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import RoutineSheet from '$lib/components/exercise/RoutineSheet.svelte';
	import ScreenHeader from '$lib/components/exercise/ScreenHeader.svelte';
	import { routineTotals } from '$lib/domain/exercises';
	import { tend } from '$lib/state/tend.svelte';
	import Button from '$lib/ui/Button.svelte';

	const id = $derived(page.params.id ?? '');
	const routine = $derived(tend.routine(id));
	const home = resolve('/exercise');

	async function start() {
		if (tend.startWorkout(id)) await goto(resolve('/exercise/session'));
	}
</script>

<svelte:head>
	<title>{routine?.name ?? 'Routine'} · Fit_</title>
</svelte:head>

{#if routine}
	{@const totals = routineTotals(routine)}
	{#snippet edit()}
		<a
			href={resolve('/exercise/routines/[id]/edit', { id })}
			class="border-border bg-card flex h-9 shrink-0 items-center rounded-xl border px-3 text-sm"
		>
			Edit
		</a>
	{/snippet}

	<div class="flex flex-col gap-4">
		<ScreenHeader
			back="/exercise"
			backLabel="Back to Exercise"
			title={routine.name}
			action={edit}
		/>
		<p class="text-muted-foreground -mt-2 px-1 text-sm">
			{totals.exercises} exercises · {totals.sets} sets · loads from your last session
		</p>
		<RoutineSheet
			{routine}
			onload={(index: number, direction: number) =>
				tend.bumpRoutineExercise(id, index, 'load', direction)}
		/>
		<div class="bg-background sticky bottom-0 -mx-5 mt-2 px-5 pt-3 pb-1">
			<Button class="w-full" size="lg" onclick={start}>Start this session</Button>
		</div>
	</div>
{:else}
	<div class="flex flex-col gap-4">
		<ScreenHeader back="/exercise" backLabel="Back to Exercise" title="Routine" />
		<p class="text-muted-foreground px-1 text-sm">That routine is gone.</p>
		<a href={home} class="text-primary px-1 text-sm underline">Back to Exercise</a>
	</div>
{/if}
