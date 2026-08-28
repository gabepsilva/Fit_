<script lang="ts">
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Home from '@lucide/svelte/icons/house';
	import Plus from '@lucide/svelte/icons/plus';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import UserRound from '@lucide/svelte/icons/user-round';
	import { resolve } from '$app/paths';
	import NavLink from './NavLink.svelte';
	import type { NavRoute } from './nav-routes';

	/**
	 * The pathname is a prop rather than read from `$app/state` here so the
	 * active state is a plain input — the shell owns knowing where we are.
	 */
	let { pathname, onlog }: { pathname: string; onlog: () => void } = $props();

	type Destination = { route: NavRoute; label: string; icon: typeof Home; active: boolean };

	function destination(route: NavRoute, label: string, icon: typeof Home): Destination {
		return { route, label, icon, active: pathname === resolve(route) };
	}

	const left = $derived([
		destination('/', 'Today', Home),
		destination('/progress', 'Progress', TrendingUp)
	]);
	const right = $derived([
		destination('/plan', 'Plan', CalendarDays),
		destination('/you', 'You', UserRound)
	]);
</script>

<nav
	class="border-border bg-card/95 sticky bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-sm"
>
	<div class="flex items-end px-2 pt-1">
		{#each left as item (item.route)}
			<NavLink {...item} />
		{/each}
		<div class="flex flex-1 flex-col items-center">
			<button
				type="button"
				onclick={onlog}
				aria-label="Log food"
				class="bg-primary text-primary-foreground -mt-5 flex size-14 items-center justify-center rounded-full shadow-[var(--shadow-border)] transition-transform duration-150 active:scale-[0.96]"
			>
				<Plus class="size-6" />
			</button>
			<span class="text-muted-foreground mt-1 mb-2 text-xs font-medium">Log</span>
		</div>
		{#each right as item (item.route)}
			<NavLink {...item} />
		{/each}
	</div>
</nav>
