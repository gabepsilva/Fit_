<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<title>Fit_</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<main>
	{@render children()}
</main>
