<script lang="ts">
	import { Dialog } from 'bits-ui';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Dumbbell from '@lucide/svelte/icons/dumbbell';
	import Home from '@lucide/svelte/icons/house';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import UserRound from '@lucide/svelte/icons/user-round';
	import X from '@lucide/svelte/icons/x';
	import { resolve } from '$app/paths';
	import NavLink from './NavLink.svelte';
	import type { NavRoute } from './nav-routes';

	/**
	 * The pathname is a prop rather than read from `$app/state` here so the
	 * active state is a plain input — the shell owns knowing where we are.
	 */
	let { open = $bindable(false), pathname }: { open?: boolean; pathname: string } = $props();

	type Destination = { route: NavRoute; label: string; icon: typeof Home; active: boolean };

	function destination(route: NavRoute, label: string, icon: typeof Home): Destination {
		return { route, label, icon, active: pathname === resolve(route) };
	}

	const destinations = $derived([
		destination('/', 'Today', Home),
		destination('/progress', 'Progress', TrendingUp),
		destination('/exercise', 'Exercise', Dumbbell),
		destination('/plan', 'Plan', CalendarDays),
		destination('/you', 'You', UserRound)
	]);
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="bg-foreground/25 fixed inset-0 z-50" />
		<Dialog.Content
			class="bg-card text-card-foreground fixed inset-y-0 left-0 z-50 flex w-[min(17rem,80vw)] flex-col rounded-r-3xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-border)] outline-none"
		>
			<div class="flex h-14 items-center justify-between gap-2 px-4">
				<Dialog.Title class="font-display text-xl tracking-tight">Fit_</Dialog.Title>
				<Dialog.Close
					class="text-muted-foreground hover:bg-secondary flex size-10 items-center justify-center rounded-xl"
				>
					<X class="size-4" />
					<span class="sr-only">Close menu</span>
				</Dialog.Close>
			</div>
			<Dialog.Description class="text-muted-foreground px-4 pb-3 text-xs">
				Everything stays on this device.
			</Dialog.Description>
			<nav class="flex flex-col gap-1 px-2">
				{#each destinations as item (item.route)}
					<NavLink {...item} />
				{/each}
			</nav>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
