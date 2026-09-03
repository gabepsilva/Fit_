<script lang="ts">
	import Button from './Button.svelte';
	import type { ButtonSize, ButtonVariant } from './button-variants';

	// Button takes its content as a snippet, which a props-only render cannot supply.
	let {
		label,
		variant,
		size,
		class: className,
		disabled,
		onclick
	}: {
		label: string;
		variant?: ButtonVariant | undefined;
		size?: ButtonSize | undefined;
		class?: string | undefined;
		disabled?: boolean | undefined;
		onclick?: (() => void) | undefined;
	} = $props();
</script>

<Button {variant} {size} class={className} {disabled} {onclick}>{label}</Button>
