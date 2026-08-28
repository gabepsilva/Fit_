<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/ui/cn';
	import {
		BUTTON_BASE,
		BUTTON_SIZES,
		BUTTON_VARIANTS,
		type ButtonSize,
		type ButtonVariant
	} from '$lib/ui/button-variants';

	let {
		variant = 'default',
		size = 'default',
		class: className,
		children,
		...rest
	}: HTMLButtonAttributes & {
		variant?: ButtonVariant | undefined;
		size?: ButtonSize | undefined;
		children: Snippet;
	} = $props();
</script>

<button {...rest} class={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}>
	{@render children()}
</button>
