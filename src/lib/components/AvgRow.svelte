<script lang="ts">
	import ProgressBar from '$lib/ui/ProgressBar.svelte';

	let {
		label,
		value,
		unit,
		target,
		invert = false
	}: {
		label: string;
		value: number;
		unit: string;
		target: number;
		/** For nutrients where more is the problem — sodium, not protein. */
		invert?: boolean;
	} = $props();

	// Deliberately not a pass/fail: a note, only once it is clearly off.
	const note = $derived(
		invert
			? value > target
				? ' · a little high'
				: ''
			: value < target * 0.7
				? ' · a little light'
				: ''
	);
	const reading = $derived(`${Math.round(value * 10) / 10} / ${target} ${unit}${note}`);
</script>

<li>
	<div class="flex justify-between text-sm">
		<span>{label}</span>
		<span class="tabular text-muted-foreground">{reading}</span>
	</div>
	<ProgressBar {value} {target} class="mt-1" />
</li>
