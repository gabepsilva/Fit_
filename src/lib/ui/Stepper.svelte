<script lang="ts">
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import { cn } from '$lib/ui/cn';

	/**
	 * Minus, a reading, plus. Every number in a session is adjusted mid-set with
	 * one thumb, so the control is a pair of targets rather than a text field:
	 * nobody types 47.5 while holding a dumbbell.
	 *
	 * The caller owns the value and the step; this only reports the direction.
	 */
	let {
		value,
		label,
		onstep,
		class: className
	}: {
		value: string | number;
		/** The noun being adjusted — "reps", "load" — used to name both buttons. */
		label: string;
		onstep: (direction: number) => void;
		class?: string | undefined;
	} = $props();

	const BUTTON =
		'text-muted-foreground hover:bg-secondary flex size-8 items-center justify-center rounded-lg';
</script>

<div class={cn('flex items-center gap-1', className)}>
	<button type="button" class={BUTTON} aria-label={`Decrease ${label}`} onclick={() => onstep(-1)}>
		<Minus class="size-3.5" />
	</button>
	<span class="tabular w-9 text-center text-sm">{value}</span>
	<button type="button" class={BUTTON} aria-label={`Increase ${label}`} onclick={() => onstep(1)}>
		<Plus class="size-3.5" />
	</button>
</div>
