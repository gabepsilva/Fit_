<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import { FOODS, scaleFood } from '$lib/domain/foods';
	import { findFoods } from '$lib/domain/parse-text';
	import type { Food } from '$lib/domain/types';
	import Input from '$lib/ui/Input.svelte';
	import ProvenanceBadge from './ProvenanceBadge.svelte';

	let {
		onpick,
		placeholder = 'Search foods, brands, barcodes'
	}: { onpick: (food: Food) => void; placeholder?: string } = $props();

	let query = $state('');

	const results = $derived.by(() => {
		if (!query.trim()) return FOODS.slice(0, 20);
		// A barcode is an exact match; check it before falling back to fuzzy search.
		const barcode = query.replace(/\s/g, '');
		if (/^\d{8,14}$/.test(barcode)) {
			const hit = FOODS.find((f) => f.barcode === barcode);
			if (hit) return [hit];
		}
		return findFoods(query, 20).map((r) => r.food);
	});
</script>

<div class="flex flex-col gap-3">
	<div class="relative">
		<Search
			class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
		/>
		<Input bind:value={query} {placeholder} class="pl-9" aria-label={placeholder} />
	</div>
	<ul class="flex max-h-80 flex-col gap-1 overflow-auto">
		{#each results as food (food.id)}
			{@const scaled = scaleFood(food, 1)}
			{@const summary = `${food.brand ? `${food.brand} · ` : ''}${food.servingLabel} · ${scaled.kcal} kcal · ${scaled.protein}g protein`}
			<li>
				<button
					type="button"
					onclick={() => onpick(food)}
					class="bg-background hover:bg-secondary flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors"
				>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<p class="truncate font-medium">{food.name}</p>
							<ProvenanceBadge provenance={food.provenance} />
						</div>
						<p class="text-muted-foreground truncate text-xs">{summary}</p>
					</div>
				</button>
			</li>
		{:else}
			<li class="text-muted-foreground px-2 py-6 text-center text-sm">
				Nothing in the catalog for that yet. You can still log it as custom from text.
			</li>
		{/each}
	</ul>
</div>
