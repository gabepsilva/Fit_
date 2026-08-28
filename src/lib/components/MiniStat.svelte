<script lang="ts">
	let {
		label,
		value,
		target,
		unit
	}: { label: string; value: number; target: number; unit: string } = $props();

	const pct = $derived(target > 0 ? Math.min(100, (value / target) * 100) : 0);
	const barStyle = $derived(`width: ${pct}%`);
</script>

<div>
	<div class="flex justify-between text-xs">
		<span class="text-muted-foreground">{label}</span>
		<span class="tabular">{Math.round(value)}/{Math.round(target)} {unit}</span>
	</div>
	<div class="bg-secondary mt-1 h-1.5 overflow-hidden rounded-full">
		<div class="bg-primary h-full rounded-full" style={barStyle}></div>
	</div>
</div>
