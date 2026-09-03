<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/ui/cn';

	/**
	 * `class` carries the shape and size, shared by both states; `resting` applies
	 * only while unselected and `tone` only while pressed, so the two never meet.
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
