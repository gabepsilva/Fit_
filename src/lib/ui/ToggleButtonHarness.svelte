<script lang="ts">
	import ToggleButton from './ToggleButton.svelte';

	// ToggleButton takes its label as a snippet, which a props-only render
	// cannot supply.
	let {
		label,
		pressed,
		tone,
		class: className,
		onclick
	}: {
		label: string;
		pressed: boolean;
		tone?: 'primary' | 'inverse' | undefined;
		class?: string | undefined;
		onclick?: (() => void) | undefined;
	} = $props();
</script>

<ToggleButton {pressed} {tone} class={className} {onclick}>{label}</ToggleButton>
