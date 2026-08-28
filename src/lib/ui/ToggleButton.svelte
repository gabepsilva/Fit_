<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/ui/cn';

	/**
	 * A button that reports whether it is the chosen one — filters, tabs, meal
	 * pickers, the week strip. The caller states the resting look, including its
	 * shape and size; `tone` is layered over it while pressed and wins on color,
	 * so no call site restates the selected palette.
	 */
	let {
		pressed,
		tone = 'primary',
		class: className,
		children,
		...rest
	}: HTMLButtonAttributes & {
		pressed: boolean;
		tone?: 'primary' | 'inverse' | undefined;
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
	class={cn(className, pressed && TONES[tone])}
>
	{@render children()}
</button>
