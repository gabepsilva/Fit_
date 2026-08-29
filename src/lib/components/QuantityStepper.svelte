<script lang="ts">
	import Stepper from '$lib/ui/Stepper.svelte';

	/**
	 * A `Stepper` that owns the number instead of reporting a direction: the
	 * servings on a log row are the caller's state, not a domain quantity with
	 * rules of its own. The layout, targets and labels come from the primitive.
	 */
	let {
		value = $bindable(),
		step = 0.5,
		min = 0.25
	}: { value: number; step?: number; min?: number } = $props();

	/** Trim a fractional serving to its shortest readable form: 1.5, not 1.50. */
	const display = $derived(
		Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
	);

	function bump(direction: number) {
		value = Math.max(min, Math.round((value + step * direction) * 100) / 100);
	}
</script>

<Stepper value={display} size="md" onstep={bump} />
