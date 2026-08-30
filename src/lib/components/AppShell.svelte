<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { Toaster } from 'svelte-sonner';
	import { logUi } from '$lib/state/log-ui.svelte';
	import { session } from '$lib/state/session.svelte';
	import { tend } from '$lib/state/tend.svelte';
	import LogSheet from './LogSheet.svelte';
	import Onboarding from './Onboarding.svelte';
	import SideNav from './SideNav.svelte';
	import TopBar from './TopBar.svelte';

	let { children }: { children: Snippet } = $props();

	let menuOpen = $state(false);

	// The store reads `localStorage`, so restoring it has to wait for the client.
	// Until then nothing is rendered, rather than flashing onboarding at someone
	// who onboarded months ago.
	onMount(() => {
		tend.hydrate();
		// The session record is restored beside the journal and for the same
		// reason: both read `localStorage`, which only exists on the client.
		session.hydrate();
	});

	// Arriving somewhere new closes the drawer. Hooking navigation rather than the
	// link clicks also covers the back button, which would otherwise leave the
	// menu sitting open over a page it no longer describes.
	afterNavigate(() => (menuOpen = false));
</script>

{#if tend.hydrated}
	<div class="bg-background flex min-h-dvh justify-center">
		{#if tend.state.onboarded}
			<div class="bg-background flex min-h-dvh w-full max-w-lg flex-col">
				<TopBar
					{menuOpen}
					onmenu={() => (menuOpen = true)}
					onphoto={() => logUi.show('photo')}
					onlog={() => logUi.show()}
				/>
				<div class="flex-1 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
					{@render children()}
				</div>
				<SideNav bind:open={menuOpen} pathname={page.url.pathname} />
				<LogSheet />
				<Toaster />
			</div>
		{:else}
			<Onboarding />
		{/if}
	</div>
{/if}
