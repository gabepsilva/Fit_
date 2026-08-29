<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { resolve } from '$app/paths';
	import { calendarWeeks, MONTHS_LONG } from '$lib/domain/training-plan';
	import { tend } from '$lib/state/tend.svelte';
	import MonthWeekRow from '$lib/components/exercise/MonthWeekRow.svelte';
	import { assignedCount, planOptions } from '$lib/components/exercise/plan-options';
	import RoutineBrushes from '$lib/components/exercise/RoutineBrushes.svelte';
	import ScreenHeader from '$lib/components/exercise/ScreenHeader.svelte';

	const year = new Date().getFullYear();
	let month = $state(new Date().getMonth());
	let picked = $state('');

	const routines = $derived(tend.state.routines);
	const options = $derived(planOptions(routines));
	const weeks = $derived(calendarWeeks(year).filter((week) => week.month === month));
	const assigned = $derived(assignedCount(weeks, tend.state.trainingPlan, year));
	// Until a pill is tapped the first routine is the brush, so a week row means
	// something on arrival rather than doing nothing until something is chosen.
	const brush = $derived(
		options.find((option) => option.id === picked)?.id ?? options[0]?.id ?? ''
	);
</script>

<svelte:head>
	<title>Plan · Fit_</title>
</svelte:head>

<div class="flex flex-col gap-5 pb-10">
	<ScreenHeader back="/exercise" title="Plan">
		{#snippet action()}
			<a
				href={resolve('/exercise/plan/year')}
				class="border-border bg-card text-foreground hover:bg-secondary flex h-9 items-center rounded-xl border px-3 text-sm"
			>
				Year
			</a>
		{/snippet}
	</ScreenHeader>

	{#if routines.length === 0}
		<section class="bg-card shadow-border flex flex-col items-start gap-3 rounded-3xl p-5">
			<h2 class="font-display text-xl">Nothing to plan yet</h2>
			<p class="text-muted-foreground text-sm">
				A week names one routine. Add a routine first, then the year has something to hold.
			</p>
			<a
				href={resolve('/exercise')}
				class="bg-primary text-primary-foreground flex h-11 items-center rounded-xl px-4 text-sm font-medium"
			>
				Back to Exercise
			</a>
		</section>
	{:else}
		<div class="flex items-center justify-between gap-2">
			<button
				type="button"
				aria-label="Previous month"
				disabled={month === 0}
				onclick={() => (month -= 1)}
				class="bg-secondary text-foreground flex size-10 items-center justify-center rounded-2xl disabled:opacity-40"
			>
				<ChevronLeft class="size-4" />
			</button>
			<div class="text-center">
				<h1 class="font-display text-2xl">{MONTHS_LONG[month]} {year}</h1>
				<p class="text-muted-foreground text-xs">{weeks.length} weeks · {assigned} assigned</p>
			</div>
			<button
				type="button"
				aria-label="Next month"
				disabled={month === MONTHS_LONG.length - 1}
				onclick={() => (month += 1)}
				class="bg-secondary text-foreground flex size-10 items-center justify-center rounded-2xl disabled:opacity-40"
			>
				<ChevronRight class="size-4" />
			</button>
		</div>

		<RoutineBrushes {options} selected={brush} onpick={(id: string) => (picked = id)} />

		<div class="flex flex-col gap-2">
			{#each weeks as week (week.week)}
				<MonthWeekRow
					{week}
					{options}
					{year}
					plan={tend.state.trainingPlan}
					onpick={() => tend.planWeeks(year, [week.week], brush)}
				/>
			{/each}
		</div>

		<button
			type="button"
			onclick={() =>
				tend.planWeeks(
					year,
					weeks.map((week) => week.week),
					brush
				)}
			class="bg-primary text-primary-foreground h-12 w-full rounded-2xl text-[15px] font-medium"
		>
			Apply to all {weeks.length} weeks
		</button>
	{/if}
</div>
