<script lang="ts">
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import X from '@lucide/svelte/icons/x';
	import type { RoutineExercise } from '$lib/domain/types';
	import Stepper from '$lib/ui/Stepper.svelte';

	// No loads here on purpose: a load is a record of last week, not part of the plan.
	let {
		index,
		exercise,
		onmoveup,
		onremove,
		onbump
	}: {
		index: number;
		exercise: RoutineExercise;
		onmoveup: () => void;
		onremove: () => void;
		onbump: (field: 'sets' | 'reps', direction: number) => void;
	} = $props();

	const ICON_BUTTON =
		'text-muted-foreground hover:bg-secondary hover:text-foreground flex size-9 shrink-0 items-center justify-center rounded-xl disabled:opacity-40';

	// Every control names the movement: bare "Increase reps" is ambiguous across rows.
	const moveLabel = $derived(`Move ${exercise.name} up`);
	const removeLabel = $derived(`Remove ${exercise.name}`);
	const setsLabel = $derived(`${exercise.name} sets`);
	const repsLabel = $derived(`${exercise.name} reps`);
</script>

<li class="bg-card rounded-3xl p-4 shadow-border">
	<div class="flex items-start gap-2.5">
		<span class="tabular text-muted-foreground w-4 shrink-0 pt-1 text-xs">{index + 1}</span>
		<span class="min-w-0 flex-1">
			<span class="block text-sm font-medium">{exercise.name}</span>
			<span class="text-muted-foreground mt-0.5 block text-xs tracking-[0.06em] uppercase">
				{exercise.group}
			</span>
		</span>
		<button
			type="button"
			onclick={onmoveup}
			disabled={index === 0}
			aria-label={moveLabel}
			class={ICON_BUTTON}
		>
			<ChevronUp class="size-4" />
		</button>
		<button type="button" onclick={onremove} aria-label={removeLabel} class={ICON_BUTTON}>
			<X class="size-4" />
		</button>
	</div>
	<div class="border-border/60 mt-3 flex items-center gap-1.5 border-t pt-3">
		<span class="text-muted-foreground w-8 text-xs">Sets</span>
		<Stepper
			value={exercise.sets}
			label={setsLabel}
			onstep={(direction: number) => onbump('sets', direction)}
		/>
		<span class="text-muted-foreground ml-3 w-8 text-xs">Reps</span>
		<Stepper
			value={exercise.reps}
			label={repsLabel}
			onstep={(direction: number) => onbump('reps', direction)}
		/>
	</div>
</li>
