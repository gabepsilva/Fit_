<script lang="ts">
	import Label from './Label.svelte';

	// Label takes its text as a snippet, which a props-only render cannot supply.
	let {
		text,
		for: htmlFor,
		class: className
	}: { text: string; for: string; class?: string } = $props();
</script>

<Label for={htmlFor} class={className}>{text}</Label>
