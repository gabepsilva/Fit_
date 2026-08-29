<script lang="ts">
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import ChartColumn from '@lucide/svelte/icons/chart-no-axes-column';
	import Plus from '@lucide/svelte/icons/plus';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { todayISO, weekdayLong } from '$lib/domain/utils';
	import { tend } from '$lib/state/tend.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import FirstRunTemplates from '$lib/components/exercise/FirstRunTemplates.svelte';
	import ResumeWorkoutBanner from '$lib/components/exercise/ResumeWorkoutBanner.svelte';
	import RoutineRow from '$lib/components/exercise/RoutineRow.svelte';
	import TodaySessionCard from '$lib/components/exercise/TodaySessionCard.svelte';
	import TrainingWeekStrip from '$lib/components/exercise/TrainingWeekStrip.svelte';

	const today = todayISO();

	const routines = $derived(tend.state.routines);

	async function buildRoutine() {
		const routine = tend.createRoutine();
		await goto(resolve('/exercise/routines/[id]/edit', { id: routine.id }));
	}

	async function startRoutine(routineId: string) {
		if (tend.startWorkout(routineId)) await goto(resolve('/exercise/session'));
	}
</script>

<svelte:head>
	<title>Exercise · Fit_</title>
</svelte:head>

{#if routines.length === 0}
	<FirstRunTemplates onpick={(id: string) => tend.useTemplate(id)} onopen={buildRoutine} />
{:else}
	<div class="flex flex-col gap-6 pb-10">
		<ResumeWorkoutBanner workout={tend.activeWorkout} />

		<div class="flex items-start justify-between gap-2">
			<PageHeader kicker={weekdayLong(today)} title="Exercise" />
			<div class="flex shrink-0 gap-2 pt-1">
				<a
					href={resolve('/exercise/plan')}
					class="border-border bg-card text-foreground hover:bg-secondary flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm"
				>
					<CalendarDays class="size-4" />
					Plan
				</a>
				<a
					href={resolve('/exercise/progress')}
					aria-label="Training progress"
					class="border-border bg-card text-foreground hover:bg-secondary flex size-10 items-center justify-center rounded-xl border"
				>
					<ChartColumn class="size-4" />
				</a>
			</div>
		</div>

		<TodaySessionCard
			{routines}
			{today}
			plan={tend.state.trainingPlan}
			workouts={tend.state.workouts}
			onstart={startRoutine}
		/>

		<TrainingWeekStrip
			{routines}
			{today}
			plan={tend.state.trainingPlan}
			workouts={tend.state.workouts}
		/>

		<div class="flex flex-col gap-2">
			<div class="flex items-baseline justify-between px-1">
				<p class="text-muted-foreground text-[0.65rem] font-medium tracking-[0.14em] uppercase">
					Routines
				</p>
				<span class="text-muted-foreground text-xs">{routines.length} in rotation</span>
			</div>
			{#each routines as routine, index (routine.id)}
				<RoutineRow {routine} {index} onstart={startRoutine} />
			{/each}
			<button
				type="button"
				onclick={buildRoutine}
				class="border-border text-muted-foreground flex h-12 items-center justify-center gap-2 rounded-2xl border border-dashed text-sm"
			>
				<Plus class="size-4" />
				New routine
			</button>
		</div>
	</div>
{/if}
