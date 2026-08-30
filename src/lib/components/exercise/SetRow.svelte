<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import { formatLoad } from '$lib/domain/exercises';
	import type { WorkoutSet } from '$lib/domain/types';
	import { cn } from '$lib/ui/cn';
	import Stepper from '$lib/ui/Stepper.svelte';
	import ToggleButton from '$lib/ui/ToggleButton.svelte';
	import { SET_GRID } from './sheet-grids';

	/**
	 * One line of the set list: which set, what it is being done at, and whether
	 * it happened. Reps and load stay adjustable after the tick, because the
	 * number that was planned and the number that was lifted often differ and
	 * the correction usually arrives a moment late.
	 */
	let {
		number,
		set,
		onstep,
		ontoggle
	}: {
		number: number;
		set: WorkoutSet;
		onstep: (field: 'reps' | 'load', direction: number) => void;
		ontoggle: () => void;
	} = $props();
</script>

<div class={cn(SET_GRID, 'items-center rounded-2xl px-1 py-1', set.done && 'bg-muted/70')}>
	<span
		class={cn(
			'tabular flex size-7 items-center justify-center rounded-lg text-xs',
			set.done ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground/70'
		)}
	>
		{number}
	</span>
	<Stepper
		class="justify-center"
		value={set.reps}
		label="reps on set {number}"
		onstep={(direction: number) => onstep('reps', direction)}
	/>
	<Stepper
		class="justify-center"
		value={formatLoad(set.load)}
		label="load on set {number}"
		onstep={(direction: number) => onstep('load', direction)}
	/>
	<ToggleButton
		pressed={set.done}
		aria-label="Set {number} done"
		onclick={ontoggle}
		resting="text-muted-foreground"
		class="border-border flex size-9 items-center justify-center rounded-xl border"
	>
		<Check class="size-4" />
	</ToggleButton>
</div>
