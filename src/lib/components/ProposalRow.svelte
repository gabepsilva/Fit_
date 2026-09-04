<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { FOOD_BY_ID } from '$lib/domain/foods';
	import { describeRecorded, resolveQuantity, type QuantifiedItem } from '$lib/domain/quantity';
	import type { Food } from '$lib/domain/types';
	import FoodSearch from './FoodSearch.svelte';
	import ProvenanceBadge from './ProvenanceBadge.svelte';
	import QuantityStepper from './QuantityStepper.svelte';

	let {
		item,
		step,
		matching,
		onmatch,
		onpickmatch,
		onchange,
		onremove
	}: {
		item: QuantifiedItem;
		step: number;
		matching: boolean;
		onmatch: () => void;
		onpickmatch: (food: Food) => void;
		onchange: (next: QuantifiedItem) => void;
		onremove: () => void;
	} = $props();

	const food = $derived(item.foodId ? FOOD_BY_ID[item.foodId] : undefined);
	const summary = $derived(`${Math.round(item.confidence * 100)}% sure · ${item.meal}`);
	const removeLabel = $derived(`Remove ${item.name}`);
	// Re-read against the food rather than trusting a stored flag: matching an item
	// to the catalog can turn a quantity the parser had to decline into one it can use.
	const declined = $derived(item.quantity ? resolveQuantity(item.quantity, food).declined : null);
	const recorded = $derived(describeRecorded(item.servings, food, declined));
</script>

<li class="bg-background rounded-2xl p-3">
	<div class="flex items-start gap-2">
		<div class="min-w-0 flex-1">
			<p class="font-medium">{item.name}</p>
			<div class="mt-1 flex flex-wrap items-center gap-1.5">
				{#if food}
					<ProvenanceBadge provenance={food.provenance} />
				{:else}
					<button type="button" onclick={onmatch} class="text-primary text-xs underline">
						Match to catalog
					</button>
				{/if}
				<span class="text-muted-foreground text-xs">{summary}</span>
			</div>
		</div>
		<button
			type="button"
			onclick={onremove}
			class="text-muted-foreground hover:bg-secondary flex size-10 items-center justify-center rounded-xl"
			aria-label={removeLabel}
		>
			<X class="size-4" />
		</button>
	</div>
	<div class="mt-2 flex items-center justify-between">
		<p class="text-muted-foreground text-xs">{food?.servingLabel ?? 'serving'}</p>
		<QuantityStepper
			bind:value={() => item.servings, (n: number) => onchange({ ...item, servings: n })}
			{step}
		/>
	</div>
	<p class="text-muted-foreground mt-1.5 text-xs">{recorded}</p>
	{#if matching}
		<div class="mt-3">
			<FoodSearch onpick={onpickmatch} placeholder="Find a catalog match" />
		</div>
	{/if}
</li>
