<script lang="ts">
	import type { Component } from 'svelte';
	import { resolve } from '$app/paths';
	import type { NavRoute } from './nav-routes';
	import { cn } from '$lib/ui/cn';

	let {
		route,
		label,
		icon: Icon,
		active
	}: {
		route: NavRoute;
		label: string;
		icon: Component<{ class?: string; strokeWidth?: number }>;
		active: boolean;
	} = $props();

	const href = $derived(resolve(route));
</script>

<a
	{href}
	aria-current={active ? 'page' : undefined}
	class={cn(
		'flex h-12 items-center gap-3 rounded-2xl px-3 text-sm font-medium',
		active ? 'bg-accent text-primary' : 'text-muted-foreground'
	)}
>
	<Icon class="size-5" strokeWidth={active ? 2.2 : 1.8} />
	{label}
</a>
