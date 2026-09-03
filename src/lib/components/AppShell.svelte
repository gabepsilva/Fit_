<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Toaster } from 'svelte-sonner';
	import { logUi } from '$lib/state/log-ui.svelte';
	import { session } from '$lib/state/session.svelte';
	import { tend } from '$lib/state/tend.svelte';
	import { AUTH_ROUTES, signInPath } from './auth/auth-routes';
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
		// reason: both read `localStorage`, which only exists on the client. It is
		// also what the gate below reads, so it has to be restored before anything
		// decides whether to render a page or a sign-in form.
		session.hydrate();
		// What was restored is only what signing in answered, months ago perhaps,
		// and the session behind it may have been revoked from another device
		// since. The server is asked once, and only when there is something to
		// reconcile: a device that was never signed in has nothing to ask about,
		// and the sign-in page it is sent to asks that question for it.
		if (session.signedIn) void session.refresh();
	});

	// Arriving somewhere new closes the drawer. Hooking navigation rather than the
	// link clicks also covers the back button, which would otherwise leave the
	// menu sitting open over a page it no longer describes.
	afterNavigate(() => (menuOpen = false));

	/** Both stores read `localStorage`, and neither answers anything before it has. */
	const restored = $derived(tend.hydrated && session.hydrated);

	const pathname = $derived(page.url?.pathname ?? '/');
	const onAuthRoute = $derived(AUTH_ROUTES.some((route) => resolve(route) === pathname));

	/**
	 * The whole address that was asked for, fragment included.
	 *
	 * The fragment is the part it would be easiest to drop and hardest to
	 * notice: a link to `/exercise/session#set-3` that came back without it
	 * would look like it worked and land at the top of the page.
	 */
	const here = $derived(`${pathname}${page.url?.search ?? ''}${page.url?.hash ?? ''}`);

	/**
	 * A clock the gate can see.
	 *
	 * `session.signedIn` compares the expiry against `Date.now()`, and a wall
	 * clock is not reactive: left alone, a tab open past the expiry keeps
	 * rendering the app because nothing tells it the moment passed. That was a
	 * cosmetic staleness when the record only named an account in the drawer.
	 * It is not cosmetic now — it is the whole app on the wrong side of the gate
	 * — so the moment is waited for rather than noticed.
	 */
	let clock = $state(Date.now());

	/** A day. `setTimeout` overflows past ~24.9 days and fires at once. */
	const LONGEST_WAIT = 86_400_000;

	$effect(() => {
		const expiresAt = session.current?.expiresAt;
		if (expiresAt === undefined) return;
		const due = Date.parse(expiresAt) - clock;
		// The record is dropped rather than merely stopping counting: it describes
		// a session the server forgot, and the gate below reads what is left.
		if (due <= 0) {
			session.forget();
			return;
		}
		// A ninety-day session is far past what one timer can hold, so the wait is
		// taken a day at a time and re-armed by the tick this effect depends on.
		const id = setTimeout(() => (clock = Date.now()), Math.min(due, LONGEST_WAIT));
		return () => clearTimeout(id);
	});

	/**
	 * The gate.
	 *
	 * A client-side gate and nothing more: it decides what this device draws, and
	 * the server decides what it may have. That is not a weakness of this shell so
	 * much as the only thing it could be — `ssr` is off for both targets and the
	 * Capacitor build is static, so there is no server render to refuse. When the
	 * store starts fetching a journal, the endpoint behind it answers 401 to
	 * exactly the requests this hides, and that refusal is the real boundary.
	 *
	 * What it does buy is the product rule: nobody sees a page, a menu or a
	 * feature before they have signed in. Rendering nothing while the redirect
	 * runs is deliberate — a shell drawn first and replaced afterwards would show
	 * the journal it is meant to withhold.
	 *
	 * It is an effect rather than a `load` guard in `+layout.ts`, and that is the
	 * deliberate half of the design. A `load` guard runs on entry and on
	 * navigation, which are only one of the three ways someone ends up on the
	 * wrong side of this line: the other two are signing out and the expiry
	 * above, both of which change the session while the page sits still. One
	 * rule that watches the state covers all three; a `load` guard would cover
	 * the first and need a second mechanism for the rest.
	 */
	$effect(() => {
		if (!restored || onAuthRoute || session.signedIn) return;
		// Where they were headed rides along, so signing in lands on the page they
		// asked for rather than on the front one.
		void goto(signInPath(here), { replaceState: true });
	});
</script>

{#if restored}
	<div class="bg-background flex min-h-dvh justify-center">
		{#if onAuthRoute}
			<!--
				The forms carry no chrome. There is no top bar to open a drawer that
				would list destinations this visitor cannot reach, and no journal
				underneath: this is the whole screen until there is an account.
			-->
			<div class="flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
				{@render children()}
			</div>
		{:else if session.signedIn}
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
					<SideNav bind:open={menuOpen} {pathname} />
					<LogSheet />
				</div>
			{:else}
				<Onboarding />
			{/if}
		{/if}
		<!--
			One toaster for every branch, mounted outside all of them.

			Signing in is a toast immediately followed by a navigation, and that
			navigation is what swaps the branch above. A toaster inside the branch
			was unmounted mid-announcement and took the message with it, so the
			sentence confirming the sign-in never arrived.
		-->
		<Toaster />
	</div>
{/if}
