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
		onclose,
		children
	}: {
		open?: boolean;
		title: string;
		description?: string | undefined;
		class?: string | undefined;
		/** Renders a close control in the header when provided. */
		onclose?: (() => void) | undefined;
		children: Snippet;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="bg-foreground/25 data-[state=open]:animate-in data-[state=closed]:animate-out fixed inset-0 z-50"
		/>
		<Dialog.Content
			class={cn(
				'bg-card text-card-foreground fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl outline-none',
				className
			)}
		>
			<!-- The grab handle is decoration; dismissal is by tapping outside or pressing Escape. -->
			<div class="bg-border mx-auto mt-3 mb-1 h-1 w-10 rounded-full"></div>
			<div class="flex items-start justify-between gap-3 px-5 pt-2">
				<div class="min-w-0">
					<Dialog.Title class="font-display text-2xl tracking-tight">{title}</Dialog.Title>
					{#if description}
						<Dialog.Description class="text-muted-foreground text-sm">
							{description}
						</Dialog.Description>
					{/if}
				</div>
				{#if onclose}
					<button
						type="button"
						onclick={onclose}
						aria-label="Close"
						class="text-muted-foreground hover:bg-secondary flex size-10 shrink-0 items-center justify-center rounded-xl"
					>
						<X class="size-4" />
					</button>
				{/if}
			</div>
			{@render children()}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
