<script lang="ts">
	import Button from './Button.svelte';
	import type { ButtonSize, ButtonVariant } from './button-variants';

	// Buttons take their content as a snippet, which a props-only render cannot
	// supply; this harness exists purely so the tests can pass one.
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
