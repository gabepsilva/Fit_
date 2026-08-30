<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/ui/cn';

	/**
	 * A button that reports whether it is the chosen one — filters, tabs, meal
	 * pickers, the week strip. `class` carries the shape and size, which both
	 * states share; `resting` carries the colors that apply only while
	 * unselected, and `tone` replaces them while pressed. The two palettes are
	 * mutually exclusive by construction rather than by a class-merge resolver,
	 * so exactly one of them ever reaches the element.
	 */
	let {
		pressed,
		tone = 'primary',
		resting,
		class: className,
		children,
		...rest
	}: HTMLButtonAttributes & {
		pressed: boolean;
		tone?: 'primary' | 'inverse' | undefined;
		resting?: string | undefined;
		children: Snippet;
	} = $props();

	const TONES = {
		primary: 'bg-primary text-primary-foreground',
		inverse: 'bg-foreground text-background'
	};
</script>

<button
	{...rest}
	type="button"
	aria-pressed={pressed}
	class={cn(className, pressed ? TONES[tone] : resting)}
>
	{@render children()}
</button>
