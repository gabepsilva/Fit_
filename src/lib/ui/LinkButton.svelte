<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { cn } from '$lib/ui/cn';
	import {
		BUTTON_BASE,
		BUTTON_SIZES,
		BUTTON_VARIANTS,
		type ButtonSize,
		type ButtonVariant
	} from '$lib/ui/button-variants';

	/** Shares `Button`'s tokens so the two controls cannot drift. */
	let {
		variant = 'default',
		size = 'default',
		class: className,
		children,
		...rest
	}: HTMLAnchorAttributes & {
		variant?: ButtonVariant | undefined;
		size?: ButtonSize | undefined;
		children: Snippet;
	} = $props();
</script>

<a {...rest} class={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}>
	{@render children()}
</a>
