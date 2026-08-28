<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { Toaster } from 'svelte-sonner';
	import { logUi } from '$lib/state/log-ui.svelte';
	import { tend } from '$lib/state/tend.svelte';
	import BottomNav from './BottomNav.svelte';
	import LogSheet from './LogSheet.svelte';
	import Onboarding from './Onboarding.svelte';

	let { children }: { children: Snippet } = $props();

	// The store reads `localStorage`, so restoring it has to wait for the client.
	// Until then nothing is rendered, rather than flashing onboarding at someone
	// who onboarded months ago.
	onMount(() => tend.hydrate());
</script>

{#if tend.hydrated}
	<div class="bg-background flex min-h-dvh justify-center">
		{#if tend.state.onboarded}
			<div class="bg-background flex min-h-dvh w-full max-w-lg flex-col">
				<div class="flex-1 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
					{@render children()}
				</div>
				<BottomNav pathname={page.url.pathname} onlog={() => logUi.show()} />
				<LogSheet />
				<Toaster />
			</div>
		{:else}
			<Onboarding />
		{/if}
	</div>
{/if}
