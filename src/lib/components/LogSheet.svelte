<script lang="ts">
	import Camera from '@lucide/svelte/icons/camera';
	import Keyboard from '@lucide/svelte/icons/keyboard';
	import Mic from '@lucide/svelte/icons/mic';
	import ScanBarcode from '@lucide/svelte/icons/scan-barcode';
	import Search from '@lucide/svelte/icons/search';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { toast } from 'svelte-sonner';
	import { FOOD_BY_BARCODE, FOOD_BY_ID } from '$lib/domain/foods';
	import { guessMeal, hydrateProposal, parseLocalText } from '$lib/domain/parse-text';
	import type { Food, Meal, ProposedItem } from '$lib/domain/types';
	import { todayISO } from '$lib/domain/utils';
	import { logUi } from '$lib/state/log-ui.svelte';
	import { logFromFood, tend } from '$lib/state/tend.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import FoodSearch from './FoodSearch.svelte';
	import ProposalRow from './ProposalRow.svelte';
	import { startDictation, type Dictation } from '$lib/ui/dictation';

	type Tab = 'type' | 'photo' | 'voice' | 'scan' | 'search';

	const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
	const TABS = [
		{ id: 'type', icon: Keyboard, label: 'Type' },
		{ id: 'photo', icon: Camera, label: 'Photo' },
		{ id: 'voice', icon: Mic, label: 'Voice' },
		{ id: 'scan', icon: ScanBarcode, label: 'Scan' },
		{ id: 'search', icon: Search, label: 'Search' }
	] as const satisfies readonly { id: Tab; icon: unknown; label: string }[];

	let tab = $state<Tab>('type');
	let text = $state('');
	let meal = $state<Meal>(guessMeal());
	let listening = $state(false);
	let proposals = $state<ProposedItem[]>([]);
	let matchIndex = $state<number | null>(null);
	let dictation: Dictation | null = null;

	// GLP-1 users routinely eat part-portions, so the stepper moves in quarters.
	const step = $derived(tend.profile?.glp1 ? 0.25 : 0.5);
	const defaultServings = $derived(tend.profile?.glp1 ? 0.5 : 1);

	function reset() {
		proposals = [];
		text = '';
		matchIndex = null;
		listening = false;
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
				servings: defaultServings,
				meal,
				confidence
			}
		];
		tab = 'type';
	}

	function runText(raw: string) {
		const trimmed = raw.trim();
		if (!trimmed) return;
		// The on-device parser is the whole story for now. Assisted parsing needs
		// the server, which is not built yet; the AI tabs say so rather than
		// silently doing something weaker than the user was promised.
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

	function scanBarcode(raw: string) {
		const food = FOOD_BY_BARCODE[raw.replace(/\s/g, '')];
		if (!food) {
			toast('No catalog match for that barcode yet.');
			return;
		}
		propose(food, 0.99);
	}

	function commit() {
		const date = todayISO();
		// A proposal without a catalog match has no nutrition behind it, so it is
		// dropped rather than logged as a zero-calorie entry.
		const items = proposals
			.filter((p) => p.foodId && FOOD_BY_ID[p.foodId])
			.map((p) =>
				logFromFood({
					foodId: p.foodId as string,
					servings: p.servings,
					meal: p.meal,
					date,
					source: 'text',
					note: p.note
				})
			);
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
			<button
				type="button"
				aria-pressed={tab === t.id}
				onclick={() => (tab = t.id)}
				class="flex h-11 flex-1 flex-col items-center justify-center rounded-xl text-xs font-medium {tab ===
				t.id
					? 'bg-primary text-primary-foreground'
					: 'bg-secondary text-muted-foreground'}"
			>
				<Icon class="size-4" />
				{t.label}
			</button>
		{/each}
	</div>

	<div class="min-h-0 flex-1 overflow-auto px-5 py-4 pb-8">
		<div class="mb-3 flex gap-1">
			{#each MEALS as m (m)}
				<button
					type="button"
					aria-pressed={meal === m}
					onclick={() => (meal = m)}
					class="h-8 flex-1 rounded-full text-xs capitalize {meal === m
						? 'bg-foreground text-background'
						: 'bg-secondary text-muted-foreground'}"
				>
					{m}
				</button>
			{/each}
		</div>

		{#if tab === 'type'}
			<div class="flex flex-col gap-3">
				<Textarea
					bind:value={text}
					placeholder="two eggs, toast, black coffee"
					rows={3}
					aria-label="What you ate"
				/>
				<Button onclick={() => runText(text)} disabled={!text.trim()}>Parse</Button>
			</div>
		{:else if tab === 'photo'}
			<div class="bg-background flex flex-col items-center gap-3 rounded-3xl px-4 py-8 text-center">
				<Camera class="text-muted-foreground size-8" />
				<p class="text-muted-foreground max-w-xs text-sm">
					Reading a plate from a photo needs the server, which isn’t built yet. Type or search for
					now.
				</p>
				<Button variant="secondary" onclick={() => (tab = 'type')}>Type it instead</Button>
			</div>
		{:else if tab === 'voice'}
			<div class="bg-background flex flex-col items-center gap-3 rounded-3xl px-4 py-8 text-center">
				<Mic class="size-8 {listening ? 'text-primary' : 'text-muted-foreground'}" />
				<p class="text-muted-foreground max-w-xs text-sm">
					Say what you ate. It goes through the same on-device parser as typing.
				</p>
				<Button onclick={toggleVoice} variant={listening ? 'secondary' : 'default'}>
					{listening ? 'Listening — tap to stop' : 'Start listening'}
				</Button>
			</div>
		{:else if tab === 'scan'}
			<div class="bg-background flex flex-col items-center gap-3 rounded-3xl px-4 py-8 text-center">
				<ScanBarcode class="text-primary size-8" />
				<p class="text-muted-foreground max-w-xs text-sm">
					Packaged foods with a barcode. Type the digits into Search, or use the demo scan.
				</p>
				<Button onclick={() => scanBarcode('602652171032')}>Demo scan</Button>
			</div>
		{:else}
			<FoodSearch onpick={(food: Food) => propose(food, 1)} />
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
							onmatch={() => (matchIndex = matchIndex === i ? null : i)}
							onpickmatch={(food: Food) => {
								proposals = proposals.map((x, idx) =>
									idx === i ? { ...x, foodId: food.id, name: food.name, confidence: 1 } : x
								);
								matchIndex = null;
							}}
							onchange={(next: ProposedItem) =>
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
