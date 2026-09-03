<script lang="ts">
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import { cn } from '$lib/ui/cn';

	/**
	 * Minus, a reading, plus. Every number in the app is adjusted with one thumb,
	 * so the control is a pair of targets rather than a text field: nobody types
	 * 47.5 while holding a dumbbell.
	 *
	 * The caller owns the value and the step; this only reports the direction.
	 * `QuantityStepper` wraps it for the callers that would rather bind a number.
	 */
	let {
		value,
		label = '',
		size = 'sm',
		onstep,
		class: className
	}: {
		value: string | number;
		/** The noun being adjusted — "reps", "load" — used to name both buttons. */
		label?: string | undefined;
		/** `sm` sits inside a row of its own; `md` stands alone beside 40px controls. */
		size?: 'sm' | 'md' | undefined;
		onstep: (direction: number) => void;
		class?: string | undefined;
	} = $props();

	// Both variants carry their fill at rest. Chrome that only arrives on hover
	// never arrives at all on a touch screen, which is where every one of these
	// is actually pressed.
	const SIZES = {
		sm: {
			button: 'bg-secondary text-muted-foreground size-8 rounded-lg active:scale-[0.96]',
			icon: 'size-3.5',
			readout: 'w-9'
		},
		md: {
			button: 'bg-secondary text-foreground size-10 rounded-xl active:scale-[0.96]',
			icon: 'size-4',
			readout: 'min-w-10 font-medium'
		}
	} as const;

	const style = $derived(SIZES[size]);
	const button = $derived(
		cn('flex items-center justify-center transition-transform duration-150', style.button)
	);
	// A stepper with nothing to name adjusts the only number in view, so its
	// buttons say what they do rather than trailing an empty noun.
	const decrease = $derived(label ? `Decrease ${label}` : 'Decrease');
	const increase = $derived(label ? `Increase ${label}` : 'Increase');
</script>

<div class={cn('flex items-center gap-1', className)}>
	<button type="button" class={button} aria-label={decrease} onclick={() => onstep(-1)}>
		<Minus class={style.icon} />
	</button>
	<span class={cn('tabular text-center text-sm', style.readout)}>{value}</span>
	<button type="button" class={button} aria-label={increase} onclick={() => onstep(1)}>
		<Plus class={style.icon} />
	</button>
</div>
