<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { resolve } from '$app/paths';
	import { calendarWeeks, MONTHS_LONG, plannedRoutineId } from '$lib/domain/training-plan';
	import { tend } from '$lib/state/tend.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import MonthWeekRow from '$lib/components/exercise/MonthWeekRow.svelte';
	import { planOptions } from '$lib/components/exercise/plan-options';
	import RoutineBrushes from '$lib/components/exercise/RoutineBrushes.svelte';
	import ScreenHeader from '$lib/components/exercise/ScreenHeader.svelte';
	import Button from '$lib/ui/Button.svelte';
	import LinkButton from '$lib/ui/LinkButton.svelte';

	const year = new Date().getFullYear();
	const yearHref = resolve('/exercise/plan/year');
	let month = $state(new Date().getMonth());
	let picked = $state('');

	const routines = $derived(tend.state.routines);
	const options = $derived(planOptions(routines));
	const weeks = $derived(calendarWeeks(year).filter((week) => week.month === month));
	const assigned = $derived(
		weeks.filter((week) => plannedRoutineId(tend.state.trainingPlan, year, week.week)).length
	);
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
			<LinkButton variant="outline" size="sm" href={yearHref}>Year</LinkButton>
		{/snippet}
	</ScreenHeader>

	{#if routines.length === 0}
		<EmptyState title="Nothing to plan yet">
			A week names one routine. Add a routine first, then the year has something to hold.
			{#snippet action()}
				<LinkButton href={resolve('/exercise')}>Back to Exercise</LinkButton>
			{/snippet}
		</EmptyState>
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

		<Button
			size="lg"
			class="w-full text-[15px]"
			onclick={() =>
				tend.planWeeks(
					year,
					weeks.map((week) => week.week),
					brush
				)}
		>
			Apply to all {weeks.length} weeks
		</Button>
	{/if}
</div>
