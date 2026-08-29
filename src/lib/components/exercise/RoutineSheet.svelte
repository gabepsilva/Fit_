<script lang="ts">
	import FormCheckModal from '$lib/components/exercise/FormCheckModal.svelte';
	import RoutineSheetRow from '$lib/components/exercise/RoutineSheetRow.svelte';
	import { muscleSections } from '$lib/domain/exercises';
	import type { Routine } from '$lib/domain/types';
	import { cn } from '$lib/ui/cn';
	import { SHEET_GRID } from './routine-sheet-grid';

	/**
	 * The routine as the paper sheet it replaces: muscle group down the left,
	 * its movements beside it. Rows report the position they hold in the routine
	 * rather than their own name, because the same movement may appear twice.
	 */
	let {
		routine,
		onload
	}: {
		routine: Routine;
		/** One tap on a row's load stepper: the row's index, and +1 or -1. */
		onload: (index: number, direction: number) => void;
	} = $props();

	/**
	 * The group order comes from `muscleSections`; the positions come from the
	 * routine itself, so a row still knows where it lives after regrouping.
	 */
	const sections = $derived(
		muscleSections(routine.exercises).map((section) => ({
			group: section.group,
			rows: routine.exercises
				.map((exercise, index) => ({ exercise, index }))
				.filter((row) => row.exercise.group === section.group)
		}))
	);

	let openIndex = $state<number | null>(null);
	let formOpen = $state(false);
	let formName = $state('');

	function toggle(index: number) {
		openIndex = openIndex === index ? null : index;
	}

	function showForm(name: string) {
		formName = name;
		formOpen = true;
	}
</script>

<div class="flex flex-col gap-4">
	{#each sections as section (section.group)}
		<section class="bg-card flex overflow-hidden rounded-3xl shadow-border">
			<div
				class="bg-secondary border-border flex w-9 shrink-0 items-center justify-center border-r"
			>
				<span class="font-display text-primary rotate-180 text-sm [writing-mode:vertical-rl]">
					{section.group}
				</span>
			</div>
			<div class="min-w-0 flex-1">
				<div
					class={cn(
						SHEET_GRID,
						'border-border text-muted-foreground border-b py-1.5 pr-3 pl-9 text-[0.625rem] tracking-[0.12em] uppercase'
					)}
				>
					<span>Exercise</span>
					<span class="text-center">Set</span>
					<span class="text-center">Reps</span>
					<span class="text-right">Load (kg)</span>
				</div>
				{#each section.rows as row (row.index)}
					<RoutineSheetRow
						exercise={row.exercise}
						open={openIndex === row.index}
						ontoggle={() => toggle(row.index)}
						onplay={() => showForm(row.exercise.name)}
						onload={(direction: number) => onload(row.index, direction)}
					/>
				{/each}
			</div>
		</section>
	{:else}
		<p
			class="text-muted-foreground bg-card rounded-3xl px-5 py-8 text-center text-sm shadow-border"
		>
			No movements on this sheet yet. Edit the routine to put some on it.
		</p>
	{/each}
</div>

<FormCheckModal bind:open={formOpen} name={formName} onclose={() => (formOpen = false)} />
