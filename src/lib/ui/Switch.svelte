<script lang="ts">
	import { Switch } from 'bits-ui';
	import { cn } from '$lib/ui/cn';

	let { checked = $bindable(false), class: className, ...rest }: Switch.RootProps = $props();
</script>

<Switch.Root
	bind:checked
	{...rest}
	class={cn(
		'border-border bg-secondary data-[state=checked]:bg-primary focus-visible:ring-ring peer inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none',
		className
	)}
>
	<Switch.Thumb
		class="bg-card data-[state=checked]:bg-primary-foreground pointer-events-none block size-5 translate-x-0.5 rounded-full shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-6"
	/>
</Switch.Root>
