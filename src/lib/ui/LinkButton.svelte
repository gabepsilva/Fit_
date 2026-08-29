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

	/**
	 * A link that has to look like a button, because it navigates rather than
	 * acts. Same three tokens as `Button` so the two cannot drift: a screen's
	 * "Save" and its "Back" are the same control to a thumb.
	 */
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
