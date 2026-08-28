<script lang="ts">
	import {
		calmWeeks,
		computeTargets,
		latestWeight,
		microTargets,
		rollingAverages
	} from '$lib/domain/tdee';
	import { tend } from '$lib/state/tend.svelte';
	import AvgRow from '$lib/components/AvgRow.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import WeightChart from '$lib/components/WeightChart.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

	let kg = $state('');

	const profile = $derived(tend.profile);
	const targets = $derived(profile ? computeTargets(profile) : null);
	const week = $derived(profile ? rollingAverages(profile.log, 7) : null);
	const micros = $derived(profile ? microTargets(profile) : null);
	const weeks = $derived(profile ? calmWeeks(profile.log) : 0);

	function saveWeight(event: SubmitEvent) {
		event.preventDefault();
		const n = Number(kg);
		if (!n) return;
		tend.addWeight(n);
		kg = '';
	}
</script>

<svelte:head>
	<title>Progress · Fit_</title>
</svelte:head>

{#if profile && targets && week && micros}
	{@const tdee = targets.tdee}
	<div class="flex flex-col gap-6 pb-10">
		<PageHeader kicker="Trend, not a streak" title="Progress">
			{weeks} calm week{weeks === 1 ? '' : 's'} with four or more days logged. A miss never zeroes that.
		</PageHeader>

		<section class="bg-card rounded-3xl p-4 shadow-border">
			<div class="flex items-baseline justify-between">
				<h2 class="font-display text-xl tracking-tight">Weight</h2>
				<p class="tabular text-muted-foreground text-sm">
					{latestWeight(profile.weights).toFixed(1)} kg
				</p>
			</div>
			<div class="mt-3 h-44">
				<WeightChart weights={profile.weights} />
			</div>
			<form class="mt-3 flex gap-2" onsubmit={saveWeight}>
				<Input
					id="kg"
					inputmode="decimal"
					placeholder="Today’s kg"
					aria-label="Today’s weight in kilograms"
					bind:value={kg}
				/>
				<Button type="submit">Save</Button>
			</form>
		</section>

		<section class="bg-card rounded-3xl p-5 shadow-border">
			<h2 class="font-display text-xl tracking-tight">Adaptive TDEE</h2>
			<p class="font-display tabular mt-3 text-4xl tracking-tight">{tdee.inferred}</p>
			<p class="text-muted-foreground text-sm">kcal / day, inferred</p>
			<p class="text-muted-foreground mt-3 text-sm leading-relaxed">
				{#if tdee.usingAdaptive}
					From {tdee.loggedDays} logged days and {tdee.sampleSize} weigh-ins over {tdee.weightSpanDays}
					days. Average intake {tdee.avgIntake} kcal. Weight trend {tdee.kgPerWeek > 0
						? '+'
						: ''}{tdee.kgPerWeek}
					kg/week. Target is TDEE {targets.source === 'override'
						? '(manual)'
						: 'adjusted for your aim'}: {targets.kcal} kcal.
				{:else}
					Not enough history yet — using a formula estimate ({tdee.fallback} kcal). Log about two weeks
					of food and weight and Fit_ will switch to your actual burn. Unlogged days are skipped, not
					zeroed.
				{/if}
			</p>
		</section>

		<section class="bg-card rounded-3xl p-5 shadow-border">
			<h2 class="font-display text-xl tracking-tight">This week’s average</h2>
			<p class="text-muted-foreground mt-1 text-xs">
				{week.loggedDays} logged days. No pass/fail coloring.
			</p>
			<ul class="mt-4 flex flex-col gap-3">
				<AvgRow label="Energy" value={week.avg.kcal} unit="kcal" target={targets.kcal} />
				<AvgRow label="Protein" value={week.avg.protein} unit="g" target={targets.protein} />
				<AvgRow label="Fiber" value={week.avg.fiber} unit="g" target={targets.fiber} />
			</ul>
		</section>

		<section class="bg-card rounded-3xl p-5 shadow-border">
			<h2 class="font-display text-xl tracking-tight">Micronutrients</h2>
			<p class="text-muted-foreground mt-1 text-xs">
				USDA values on catalog foods. Quiet bars — a light week is information.
			</p>
			<ul class="mt-4 flex flex-col gap-3">
				<AvgRow label="Fiber" value={week.avg.fiber} unit="g" target={micros.fiber} />
				<AvgRow label="Sodium" value={week.avg.sodium} unit="mg" target={micros.sodium} invert />
				<AvgRow label="Potassium" value={week.avg.potassium} unit="mg" target={micros.potassium} />
				<AvgRow label="Iron" value={week.avg.iron} unit="mg" target={micros.iron} />
				<AvgRow label="B12" value={week.avg.vitaminB12} unit="mcg" target={micros.vitaminB12} />
				<AvgRow label="Calcium" value={week.avg.calcium} unit="mg" target={micros.calcium} />
				<AvgRow label="Magnesium" value={week.avg.magnesium} unit="mg" target={micros.magnesium} />
				<AvgRow label="Vitamin D" value={week.avg.vitaminD} unit="mcg" target={micros.vitaminD} />
			</ul>
		</section>
	</div>
{/if}
