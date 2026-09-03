<script lang="ts">
	import { volumeByGroup } from '$lib/domain/training-progress';
	import type { Workout } from '$lib/domain/types';
	import { addDaysISO, todayISO } from '$lib/domain/utils';
	import ProgressBar from '$lib/ui/ProgressBar.svelte';

	/**
	 * Bars are scaled to the busiest group, not a target, so the point is the
	 * balance between groups.
	 */
	let { workouts }: { workouts: Workout[] } = $props();

	const groups = $derived(
		volumeByGroup(workouts, addDaysISO(todayISO(), -28)).map((g) => ({
			...g,
			count: `${g.sets} sets`
		}))
	);
</script>

<section class="bg-card rounded-3xl p-4 shadow-border">
	<h2 class="font-display text-lg tracking-tight">Volume by muscle group</h2>
	{#if groups.length === 0}
		<p class="text-muted-foreground mt-1 text-sm">
			Nothing finished in the last four weeks, so there is no volume to compare.
		</p>
	{:else}
		<ul class="mt-3 flex flex-col gap-2.5">
			{#each groups as group (group.group)}
				<li>
					<div class="flex justify-between text-xs">
						<span class="text-muted-foreground">{group.group}</span>
						<span class="tabular">{group.count}</span>
					</div>
					<ProgressBar value={group.pct} target={100} class="mt-1" />
				</li>
			{/each}
		</ul>
		<p class="text-muted-foreground mt-3 text-xs">Last 4 weeks.</p>
	{/if}
</section>
