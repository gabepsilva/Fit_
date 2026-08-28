<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';
	import AppShell from '$lib/components/AppShell.svelte';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<title>Fit_</title>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#f3eee4" />
</svelte:head>

<AppShell {children} />
