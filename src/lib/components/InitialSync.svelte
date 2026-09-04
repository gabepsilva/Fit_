<script lang="ts">
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	/**
	 * What a device with no document of its own shows in the moment between
	 * signing in and the first pull landing, instead of Onboarding.
	 *
	 * A person with months of history who signs in on a new phone is, until the
	 * pull settles, indistinguishable — to this device — from someone who has
	 * never used the app. Showing Onboarding in that gap tells them their
	 * history is gone; showing nothing looks like the app has hung. This says
	 * plainly that something is on its way.
	 */
</script>

<div
	class="flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-3 px-5 py-10 text-center"
>
	<LoaderCircle class="text-muted-foreground size-6 animate-spin" aria-hidden="true" />
	<p class="text-muted-foreground text-sm" role="status">Loading your data…</p>
</div>
