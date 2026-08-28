<script lang="ts">
	import { Checkbox } from 'bits-ui';
	import Check from '@lucide/svelte/icons/check';
	import { cn } from '$lib/ui/cn';

	let { checked = $bindable(false), class: className, ...rest }: Checkbox.RootProps = $props();
</script>

<Checkbox.Root
	bind:checked
	{...rest}
	class={cn(
		'border-border bg-card data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground focus-visible:ring-ring peer size-5 shrink-0 rounded-md border focus-visible:ring-2 focus-visible:outline-none',
		className
	)}
>
	{#snippet children({ checked: isChecked })}
		{#if isChecked}
			<span class="flex items-center justify-center text-current">
				<Check class="size-3.5" strokeWidth={2.4} />
			</span>
		{/if}
	{/snippet}
</Checkbox.Root>
