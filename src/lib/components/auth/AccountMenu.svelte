<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { signOut, signOutEverywhere } from '$lib/auth/api';
	import { failureWording } from '$lib/auth/wording';
	import { session } from '$lib/state/session.svelte';
	import SectionLabel from '$lib/components/SectionLabel.svelte';
	import Button from '$lib/ui/Button.svelte';

	/**
	 * The account, at the foot of the drawer.
	 *
	 * There is no signed-out half any more, and there cannot be one: the drawer
	 * is inside the gate, so a visitor who is not signed in never reaches a
	 * screen that has a drawer on it. Signing out here leaves the journal on the
	 * device exactly where it was and returns to the sign-in form.
	 *
	 * What is shown comes from `session`, which is a cache of what the endpoint
	 * last said rather than proof of anything. That is fine for a drawer: the
	 * server decides what a request may do, and the worst a stale record can do
	 * here is offer a sign-out that answers 204 and changes nothing.
	 */

	let busy = $state(false);

	/**
	 * Both sign-outs end the same way. Anything but a connection failure means
	 * the server is not holding this session any more — a 204 because it revoked
	 * it, a 401 because it never had one — so the record goes either way. Only
	 * an unreachable server leaves it in place, because then nothing was asked
	 * and nothing was answered.
	 */
	async function end(everywhere: boolean) {
		if (busy) return;
		busy = true;
		const result = everywhere ? await signOutEverywhere() : await signOut();
		busy = false;
		if (!result.ok && result.failure.code === 'unreachable') {
			toast(failureWording(result.failure));
			return;
		}
		session.forget();
		toast(result.ok && everywhere ? 'Signed out everywhere.' : 'Signed out.');
	}
</script>

<div class="mt-auto flex flex-col gap-1 px-4 pt-4 pb-3">
	<SectionLabel>Account</SectionLabel>
	{#if session.signedIn && session.account}
		<p class="mt-1 truncate text-sm font-medium">{session.account.displayName}</p>
		<p class="text-muted-foreground truncate text-xs">
			@{session.account.username}{session.household ? ` · ${session.household.name}` : ''}
		</p>
		<Button variant="outline" size="sm" class="mt-3" disabled={busy} onclick={() => end(false)}>
			Sign out
		</Button>
		<Button variant="quiet" size="sm" disabled={busy} onclick={() => end(true)}>
			Sign out everywhere
		</Button>
	{/if}
</div>
