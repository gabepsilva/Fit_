<script lang="ts">
	import ProgressBar from '$lib/ui/ProgressBar.svelte';

	let {
		label,
		value,
		target,
		unit
	}: { label: string; value: number; target: number; unit: string } = $props();
</script>

<div>
	<div class="flex justify-between gap-2 text-xs">
		<span class="text-muted-foreground truncate">{label}</span>
		<span class="tabular shrink-0">{Math.round(value)}/{Math.round(target)} {unit}</span>
	</div>
	<ProgressBar {value} {target} class="mt-1" />
</div>
