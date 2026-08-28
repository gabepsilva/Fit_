<script lang="ts">
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

	const pct = $derived(target > 0 ? Math.min(100, (value / target) * 100) : 0);
	const barStyle = $derived(`width: ${pct}%`);
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
	<div class="bg-secondary mt-1 h-1.5 overflow-hidden rounded-full">
		<div class="bg-primary h-full rounded-full" style={barStyle}></div>
	</div>
</li>
