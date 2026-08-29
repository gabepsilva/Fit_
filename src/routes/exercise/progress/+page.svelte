<script lang="ts">
	import { resolve } from '$app/paths';
	import AdherenceList from '$lib/components/exercise/AdherenceList.svelte';
	import LoadTrend from '$lib/components/exercise/LoadTrend.svelte';
	import PersonalRecordList from '$lib/components/exercise/PersonalRecordList.svelte';
	import ScreenHeader from '$lib/components/exercise/ScreenHeader.svelte';
	import VolumeByGroup from '$lib/components/exercise/VolumeByGroup.svelte';
	import { tend } from '$lib/state/tend.svelte';

	const home = resolve('/exercise');
	const workouts = $derived(tend.state.workouts);
</script>

<svelte:head>
	<title>Training · Fit_</title>
</svelte:head>

<div class="flex flex-col gap-4 pb-10">
	<ScreenHeader back="/exercise" backLabel="Back to exercise" title="Training" />

	{#if workouts.length === 0}
		<section class="bg-card rounded-3xl p-5 shadow-border">
			<p class="text-muted-foreground text-sm">
				No finished sessions yet, so there is nothing here to chart.
			</p>
			<a href={home} class="text-primary mt-2 inline-flex h-10 items-center text-sm font-medium">
				Back to exercise
			</a>
		</section>
	{:else}
		<LoadTrend {workouts} />
		<VolumeByGroup {workouts} />
		<AdherenceList {workouts} plan={tend.state.trainingPlan} routines={tend.state.routines} />
		<PersonalRecordList {workouts} />
	{/if}
</div>
