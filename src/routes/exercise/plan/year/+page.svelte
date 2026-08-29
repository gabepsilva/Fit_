<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		calendarWeeks,
		plannedRoutineId,
		plannedWeekCount,
		WEEKS_IN_YEAR,
		type CalendarWeek
	} from '$lib/domain/training-plan';
	import { tend } from '$lib/state/tend.svelte';
	import { planOptions } from '$lib/components/exercise/plan-options';
	import ScreenHeader from '$lib/components/exercise/ScreenHeader.svelte';
	import WeekRoutineSheet from '$lib/components/exercise/WeekRoutineSheet.svelte';
	import YearMonthGrid from '$lib/components/exercise/YearMonthGrid.svelte';

	const year = new Date().getFullYear();
	const weeks = calendarWeeks(year);

	let selected = $state<CalendarWeek | null>(null);
	let open = $state(false);

	const routines = $derived(tend.state.routines);
	const options = $derived(planOptions(routines));
	const plan = $derived(tend.state.trainingPlan);
	const planned = $derived(plannedWeekCount(plan, year));

	function assign(routineId: string) {
		if (selected) tend.planWeeks(year, [selected.week], routineId);
		open = false;
	}
</script>

<svelte:head>
	<title>Plan year · Fit_</title>
</svelte:head>

<div class="flex flex-col gap-4 pb-10">
	<ScreenHeader back="/exercise/plan" backLabel="Back to month" title={String(year)}>
		{#snippet action()}
			<span class="text-muted-foreground pr-2 text-xs">{planned}/{WEEKS_IN_YEAR} planned</span>
		{/snippet}
	</ScreenHeader>

	{#if routines.length === 0}
		<p class="text-muted-foreground px-1 text-sm">
			There is no year to draw until a routine exists.
			<a href={resolve('/exercise')} class="text-primary underline">Add one on Exercise</a>.
		</p>
	{:else}
		<YearMonthGrid
			{weeks}
			{options}
			{plan}
			{year}
			onpick={(week: CalendarWeek) => {
				selected = week;
				open = true;
			}}
		/>
	{/if}
</div>

<WeekRoutineSheet
	bind:open
	week={selected}
	{year}
	{options}
	current={selected ? plannedRoutineId(plan, year, selected.week) : undefined}
	onpick={assign}
	onclose={() => (open = false)}
/>
