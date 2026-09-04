<script lang="ts">
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import CloudOff from '@lucide/svelte/icons/cloud-off';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { sync } from '$lib/state/sync.svelte';

	/**
	 * How long a save or a background read may run before it is worth mentioning.
	 *
	 * Most writes land in well under this on any connection worth the name, and
	 * saying nothing for that long is the point — logging a meal must not come
	 * with a running commentary on sync. A write still open past this delay has
	 * become noticeable on its own account, and this is where the app admits it
	 * rather than letting someone wonder if their tap registered.
	 */
	const NOTICE_DELAY_MS = 400;

	let showBusy = $state(false);

	$effect(() => {
		if (sync.status !== 'saving' && sync.status !== 'loading') {
			showBusy = false;
			return;
		}
		const id = setTimeout(() => (showBusy = true), NOTICE_DELAY_MS);
		return () => clearTimeout(id);
	});
</script>

{#if sync.status === 'waiting'}
	<p
		class="bg-secondary text-secondary-foreground mx-5 mt-3 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium"
		role="status"
	>
		<CloudOff class="size-4 shrink-0" aria-hidden="true" />
		Offline. Your changes are saved on this device and will send once you're back online.
	</p>
{:else if sync.status === 'error'}
	<p
		class="bg-destructive text-destructive-foreground mx-5 mt-3 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium"
		role="status"
	>
		<AlertTriangle class="size-4 shrink-0" aria-hidden="true" />
		Couldn't reach the server. Your changes are saved here and we'll keep trying.
	</p>
{:else if showBusy}
	<p class="text-muted-foreground mx-5 mt-3 flex items-center gap-2 text-xs" role="status">
		<LoaderCircle class="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
		Saving…
	</p>
{/if}
