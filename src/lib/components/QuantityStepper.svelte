<script lang="ts">
	import Stepper from '$lib/ui/Stepper.svelte';

	// Owns the number rather than a step direction: servings are caller state, not a domain quantity.
	let {
		value = $bindable(),
		step = 0.5,
		min = 0.25
	}: { value: number; step?: number; min?: number } = $props();

	const display = $derived(
		Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
	);

	function bump(direction: number) {
		value = Math.max(min, Math.round((value + step * direction) * 100) / 100);
	}
</script>

<Stepper value={display} size="md" onstep={bump} />
