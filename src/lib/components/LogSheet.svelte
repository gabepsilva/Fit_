<script lang="ts">
	import Camera from '@lucide/svelte/icons/camera';
	import ImageUp from '@lucide/svelte/icons/image-up';
	import Keyboard from '@lucide/svelte/icons/keyboard';
	import Mic from '@lucide/svelte/icons/mic';
	import ScanBarcode from '@lucide/svelte/icons/scan-barcode';
	import Search from '@lucide/svelte/icons/search';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { toast } from 'svelte-sonner';
	import { FOOD_BY_ID } from '$lib/domain/foods';
	import { logFromCatalogFood, logFromFood } from '$lib/domain/log-entry';
	import { guessMeal, hydrateProposal, parseLocalText } from '$lib/domain/parse-text';
	import { defaultServings, servingStep } from '$lib/domain/profile';
	import { matchToFood, type QuantifiedItem } from '$lib/domain/quantity';
	import type { Food, Meal } from '$lib/domain/types';
	import { MEALS } from '$lib/domain/types';
	import { todayISO } from '$lib/domain/utils';
	import { logUi, type LogTab } from '$lib/state/log-ui.svelte';
	import { tend } from '$lib/state/tend.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import ToggleButton from '$lib/ui/ToggleButton.svelte';
	import BarcodeScan from './BarcodeScan.svelte';
	import FoodSearch from './FoodSearch.svelte';
	import PhotoCapture from './PhotoCapture.svelte';
	import ProposalRow from './ProposalRow.svelte';
	import { startDictation, type Dictation } from '$lib/ui/dictation';

	const TABS = [
		{ id: 'type', icon: Keyboard, label: 'Type' },
		{ id: 'photo', icon: Camera, label: 'Photo' },
		{ id: 'upload', icon: ImageUp, label: 'Upload' },
		{ id: 'voice', icon: Mic, label: 'Voice' },
		{ id: 'scan', icon: ScanBarcode, label: 'Scan' },
		{ id: 'search', icon: Search, label: 'Search' }
	] as const satisfies readonly { id: LogTab; icon: unknown; label: string }[];

	let text = $state('');
	let meal = $state<Meal>(guessMeal());
	let listening = $state(false);
	let proposals = $state<QuantifiedItem[]>([]);
	let matchIndex = $state<number | null>(null);
	let dictation: Dictation | null = null;
	/**
	 * Foods the server catalog answered with, by the id `propose` put on the
	 * proposal. They are not in `FOOD_BY_ID` and never will be, so `commit` has
	 * to resolve them from here or it would drop what the person just chose --
	 * which is every result search now returns beyond the bundled 96.
	 */
	let fromCatalog = $state<Record<string, Food>>({});

	const step = $derived(servingStep(tend.profile));
	const servings = $derived(defaultServings(tend.profile));

	function reset() {
		proposals = [];
		text = '';
		matchIndex = null;
		listening = false;
		fromCatalog = {};
		logUi.tab = 'type';
	}

	function close() {
		logUi.open = false;
		reset();
	}

	function propose(food: Food, confidence: number) {
		proposals = [
			...proposals,
			{
				foodId: food.id,
				query: food.name,
				name: food.name,
				servings,
				meal,
				confidence
			}
		];
		logUi.tab = 'type';
	}

	function runText(raw: string) {
		const trimmed = raw.trim();
		if (!trimmed) return;
		// Only the on-device parser runs for now; assisted parsing needs a server that is not built yet.
		const local = parseLocalText(trimmed, meal);
		proposals = local.items.map(hydrateProposal);
		if (!local.allMatched) {
			toast('Some items need a catalog match — tap "Match to catalog".');
		}
	}

	function toggleVoice() {
		if (listening) {
			dictation?.stop();
			listening = false;
			return;
		}
		dictation = startDictation({
			onresult: (said) => {
				text = said;
				listening = false;
				runText(said);
			},
			onerror: () => {
				listening = false;
				toast('Didn’t catch that.');
			},
			onend: () => (listening = false)
		});
		if (!dictation) {
			toast('Voice typing isn’t available here. Type it instead.');
			return;
		}
		listening = true;
	}

	/** A bundled food keeps its own id; a catalog one is remembered here. */
	function remember(food: Food) {
		if (!FOOD_BY_ID[food.id]) fromCatalog = { ...fromCatalog, [food.id]: food };
	}

	function pickFood(food: Food) {
		remember(food);
		propose(food, 1);
	}

	function commit() {
		const date = todayISO();
		// Drop unmatched proposals: with no catalog food there is no nutrition to log.
		const items = proposals.flatMap((p) => {
			if (!p.foodId) return [];
			const context = {
				servings: p.servings,
				meal: p.meal,
				date,
				source: 'text' as const,
				note: p.note
			};
			if (FOOD_BY_ID[p.foodId]) return [logFromFood({ foodId: p.foodId, ...context })];
			const catalogFood = fromCatalog[p.foodId];
			return catalogFood ? [logFromCatalogFood(catalogFood, context)] : [];
		});
		if (!items.length) {
			toast('Match each item to a catalog food first.');
			return;
		}
		tend.addLogItems(items);
		toast(`Added ${items.length} ${items.length === 1 ? 'item' : 'items'}.`);
		close();
	}
</script>

<Sheet
	bind:open={
		() => logUi.open,
		(v) => {
			if (v) logUi.open = true;
			else close();
		}
	}
	title="Log"
	description="Tend proposes. You correct in one tap."
	onclose={close}
>
	<div class="flex gap-1 px-5 pt-4">
		{#each TABS as t (t.id)}
			{@const Icon = t.icon}
			<ToggleButton
				pressed={logUi.tab === t.id}
				onclick={() => (logUi.tab = t.id)}
				resting="bg-secondary text-muted-foreground"
				class="flex h-11 flex-1 flex-col items-center justify-center rounded-xl text-xs font-medium"
			>
				<Icon class="size-4" />
				{t.label}
			</ToggleButton>
		{/each}
	</div>

	<div class="min-h-0 flex-1 overflow-auto px-5 py-4 pb-8">
		<div class="mb-3 flex gap-1">
			{#each MEALS as m (m)}
				<ToggleButton
					pressed={meal === m}
					onclick={() => (meal = m)}
					resting="bg-secondary text-muted-foreground"
					class="h-8 flex-1 rounded-full text-xs capitalize"
				>
					{m}
				</ToggleButton>
			{/each}
		</div>

		{#if logUi.tab === 'type'}
			<div class="flex flex-col gap-3">
				<Textarea
					bind:value={text}
					class="min-h-24"
					placeholder="two eggs, toast, black coffee"
					rows={3}
					aria-label="What you ate"
				/>
				<Button onclick={() => runText(text)} disabled={!text.trim()}>Parse</Button>
			</div>
		{:else if logUi.tab === 'photo'}
			<PhotoCapture route="camera" ontype={() => (logUi.tab = 'type')} />
		{:else if logUi.tab === 'upload'}
			<PhotoCapture route="file" ontype={() => (logUi.tab = 'type')} />
		{:else if logUi.tab === 'voice'}
			<div class="bg-background flex flex-col items-center gap-3 rounded-3xl px-4 py-8 text-center">
				<Mic class="size-8 {listening ? 'text-primary' : 'text-muted-foreground'}" />
				<p class="text-muted-foreground max-w-xs text-sm">
					Say what you ate. It goes through the same on-device parser as typing.
				</p>
				<Button onclick={toggleVoice} variant={listening ? 'secondary' : 'default'}>
					{listening ? 'Listening — tap to stop' : 'Start listening'}
				</Button>
			</div>
		{:else if logUi.tab === 'scan'}
			<BarcodeScan onpick={pickFood} onsearch={() => (logUi.tab = 'search')} />
		{:else}
			<FoodSearch onpick={pickFood} />
		{/if}

		{#if proposals.length > 0}
			<div class="mt-5">
				<div class="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-medium">
					<Sparkles class="size-3.5" />
					Parsed on-device — tap to correct
				</div>
				<ul class="flex flex-col gap-2">
					{#each proposals as p, i (`${p.query}-${i}`)}
						<ProposalRow
							item={p}
							{step}
							matching={matchIndex === i}
							resolved={p.foodId ? fromCatalog[p.foodId] : undefined}
							onmatch={() => (matchIndex = matchIndex === i ? null : i)}
							onpickmatch={(food: Food) => {
								// Matching a proposal reaches the same search, so a catalog
								// food arrives here too and has to be remembered the same way.
								remember(food);
								proposals = proposals.map((x, idx) => (idx === i ? matchToFood(x, food) : x));
								matchIndex = null;
							}}
							onchange={(next: QuantifiedItem) =>
								(proposals = proposals.map((x, idx) => (idx === i ? next : x)))}
							onremove={() => (proposals = proposals.filter((_, idx) => idx !== i))}
						/>
					{/each}
				</ul>
				<Button class="mt-4 w-full" size="lg" onclick={commit}>Add to today</Button>
			</div>
		{/if}
	</div>
</Sheet>
