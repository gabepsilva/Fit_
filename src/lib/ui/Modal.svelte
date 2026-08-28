<script lang="ts">
	import { Dialog } from 'bits-ui';
	import X from '@lucide/svelte/icons/x';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/ui/cn';

	let {
		open = $bindable(false),
		title,
		description,
		class: className,
		children
	}: {
		open?: boolean;
		title: string;
		description?: string | undefined;
		class?: string | undefined;
		children: Snippet;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="bg-foreground/30 fixed inset-0 z-50" />
		<Dialog.Content
			class={cn(
				'bg-card text-card-foreground fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-5 shadow-border outline-none',
				className
			)}
		>
			<Dialog.Title class="font-display text-xl tracking-tight">{title}</Dialog.Title>
			{#if description}
				<Dialog.Description class="text-muted-foreground mt-2 text-sm">
					{description}
				</Dialog.Description>
			{/if}
			{@render children()}
			<Dialog.Close
				class="text-muted-foreground hover:bg-secondary absolute top-3 right-3 flex size-10 items-center justify-center rounded-xl"
			>
				<X class="size-4" />
				<span class="sr-only">Close</span>
			</Dialog.Close>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
