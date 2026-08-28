<script lang="ts">
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';

	let {
		value = $bindable(),
		step = 0.5,
		min = 0.25
	}: { value: number; step?: number; min?: number } = $props();

	/** Trim a fractional serving to its shortest readable form: 1.5, not 1.50. */
	const display = $derived(
		Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
	);

	const button =
		'flex size-10 items-center justify-center rounded-xl bg-secondary text-foreground transition-transform duration-150 active:scale-[0.96]';
</script>

<div class="flex items-center gap-1">
	<button
		type="button"
		class={button}
		aria-label="Decrease"
		onclick={() => (value = Math.max(min, Math.round((value - step) * 100) / 100))}
	>
		<Minus class="size-4" />
	</button>
	<span class="tabular min-w-10 text-center text-sm font-medium">{display}</span>
	<button
		type="button"
		class={button}
		aria-label="Increase"
		onclick={() => (value = Math.round((value + step) * 100) / 100)}
	>
		<Plus class="size-4" />
	</button>
</div>
