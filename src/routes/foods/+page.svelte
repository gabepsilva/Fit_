<script lang="ts">
	import { findFoods } from '$lib/domain/food-match';
	import { CATEGORY_LABEL, FOODS, PROVENANCE_LABEL, scaleFood } from '$lib/domain/foods';
	import type { Provenance } from '$lib/domain/types';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ProvenanceBadge from '$lib/components/ProvenanceBadge.svelte';
	import Input from '$lib/ui/Input.svelte';
	import ToggleButton from '$lib/ui/ToggleButton.svelte';

	const FILTERS: (Provenance | 'all')[] = ['all', 'usda', 'off', 'brand', 'community', 'lab'];

	let query = $state('');
	let source = $state<Provenance | 'all'>('all');

	const list = $derived.by(() => {
		const base = query.trim() ? findFoods(query, 80).map((x) => x.food) : FOODS;
		return source === 'all' ? base : base.filter((f) => f.provenance === source);
	});
</script>

<svelte:head>
	<title>Catalog · Fit_</title>
</svelte:head>

<div class="flex flex-col gap-5 pb-10">
	<PageHeader kicker="Provenance on every row" title="Catalog">
		USDA is public domain. Open Food Facts is ODbL. They never share an id.
	</PageHeader>

	<Input bind:value={query} placeholder="Search the catalog" aria-label="Search the catalog" />

	<div class="flex gap-1 overflow-auto">
		{#each FILTERS as f (f)}
			<ToggleButton
				pressed={source === f}
				onclick={() => (source = f)}
				resting="bg-card text-muted-foreground"
				class="h-9 shrink-0 rounded-full px-3 text-xs font-medium"
			>
				{f === 'all' ? 'All' : PROVENANCE_LABEL[f].title}
			</ToggleButton>
		{/each}
	</div>

	<ul class="flex flex-col gap-2">
		{#each list as food (food.id)}
			{@const s = scaleFood(food, 1)}
			<li class="bg-card rounded-2xl px-4 py-3 shadow-border">
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<p class="font-medium">{food.name}</p>
						<p class="text-muted-foreground text-xs">
							{food.brand ? `${food.brand} · ` : ''}{CATEGORY_LABEL[food.category] ??
								food.category}{food.barcode ? ` · ${food.barcode}` : ''}
						</p>
					</div>
					<ProvenanceBadge provenance={food.provenance} />
				</div>
				<p class="tabular text-muted-foreground mt-2 text-xs">
					{food.servingLabel} · {s.kcal} kcal · P {s.protein} · C {s.carbs} · F {s.fat} · fiber {s
						.micros.fiber}g
				</p>
			</li>
		{/each}
	</ul>
</div>
