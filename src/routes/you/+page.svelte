<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import { exportCsv, exportJson, mfpRowsToLogItems, parseMfpCsv } from '$lib/domain/export-data';
	import { emptyProfile } from '$lib/domain/profile';
	import { computeTargets } from '$lib/domain/tdee';
	import type { Injection, LoadUnit, UnitSystem } from '$lib/domain/types';
	import { MAX_REST_SECONDS, MIN_REST_SECONDS } from '$lib/domain/types';
	import { todayISO, uid } from '$lib/domain/utils';
	import { tend } from '$lib/state/tend.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { download } from '$lib/ui/download';
	import Input from '$lib/ui/Input.svelte';
	import Label from '$lib/ui/Label.svelte';
	import Modal from '$lib/ui/Modal.svelte';
	import Switch from '$lib/ui/Switch.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import ToggleButton from '$lib/ui/ToggleButton.svelte';

	let wipeOpen = $state(false);
	let mfp = $state('');
	let dose = $state('0.5');
	let appetite = $state<Injection['appetite']>(3);
	let notes = $state('');

	const profile = $derived(tend.profile);
	const targets = $derived(profile ? computeTargets(profile) : null);

	function setGlp1(on: boolean) {
		tend.patchActive((p) => ({
			...p,
			glp1: on,
			// Reset goal when mode is off; 'glp1' goal only exists for that mode.
			goal: on ? 'glp1' : p.goal === 'glp1' ? 'lose' : p.goal
		}));
	}

	function addPerson() {
		const p = emptyProfile({ name: 'New person' });
		tend.addProfile(p);
		tend.setActive(p.id);
	}

	function saveDose() {
		tend.addInjection({
			date: todayISO(),
			medication: 'semaglutide',
			doseMg: Number(dose) || 0,
			site: 'abdomen',
			appetite,
			sideEffects: [],
			notes
		});
		notes = '';
		toast('Dose noted.');
	}

	const UNIT_SYSTEMS: { id: UnitSystem; label: string }[] = [
		{ id: 'metric', label: 'Metric' },
		{ id: 'imperial', label: 'Imperial' }
	];

	const LOAD_UNITS: { id: LoadUnit; label: string }[] = [
		{ id: 'kg', label: 'kg' },
		{ id: 'lb', label: 'lb' }
	];

	function importMfp() {
		const items = mfpRowsToLogItems(parseMfpCsv(mfp), () => uid('l-'));
		if (!items.length) {
			toast('Couldn’t read that CSV.');
			return;
		}
		tend.addLogItems(items);
		toast(`Imported ${items.length} rows.`);
		mfp = '';
	}
</script>

<svelte:head>
	<title>You · Fit_</title>
</svelte:head>

{#if profile && targets}
	<div class="flex flex-col gap-6 pb-10">
		<PageHeader kicker="On this device" title="You" />

		<section class="bg-card rounded-3xl p-4 shadow-border">
			<h2 class="font-display text-xl tracking-tight">Household</h2>
			<div class="mt-3 flex flex-wrap gap-2">
				{#each tend.state.profiles as p (p.id)}
					<ToggleButton
						pressed={p.id === profile.id}
						onclick={() => tend.setActive(p.id)}
						resting="bg-secondary"
						class="h-10 rounded-full px-4 text-sm"
					>
						{p.name}
					</ToggleButton>
				{/each}
				<button
					type="button"
					class="bg-secondary h-10 rounded-full px-4 text-sm"
					onclick={addPerson}
				>
					Add
				</button>
			</div>
			<p class="text-muted-foreground mt-3 text-xs">
				Shared meal plans honor every profile’s restrictions. Logs stay separate.
			</p>
		</section>

		<section class="bg-card rounded-3xl p-4 shadow-border">
			<h2 class="font-display text-xl tracking-tight">Preferences</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Changes how weight and height are read. Nothing already recorded is rewritten.
			</p>
			<div class="mt-3">
				<p class="text-muted-foreground text-sm font-medium">Units</p>
				<div class="mt-2 inline-flex gap-1" role="group" aria-label="Units: metric or imperial">
					{#each UNIT_SYSTEMS as u (u.id)}
						<ToggleButton
							pressed={tend.state.units === u.id}
							onclick={() => tend.setUnits(u.id)}
							resting="bg-secondary"
							class="h-10 rounded-full px-4 text-sm"
						>
							{u.label}
						</ToggleButton>
					{/each}
				</div>
			</div>
			<div class="mt-4">
				<p class="text-muted-foreground text-sm font-medium">Exercise load label</p>
				<div class="mt-2 inline-flex gap-1" role="group" aria-label="Exercise load label: kg or lb">
					{#each LOAD_UNITS as u (u.id)}
						<ToggleButton
							pressed={tend.state.loadUnit === u.id}
							onclick={() => tend.setLoadUnit(u.id)}
							resting="bg-secondary"
							class="h-10 rounded-full px-4 text-sm"
						>
							{u.label}
						</ToggleButton>
					{/each}
				</div>
				<p class="text-muted-foreground mt-2 text-xs">
					Relabels the bar only — a load already logged keeps its number.
				</p>
			</div>
			<div class="mt-4">
				<Label for="rest-seconds">Rest between sets, seconds</Label>
				<Input
					id="rest-seconds"
					class="mt-1.5"
					type="number"
					min={MIN_REST_SECONDS}
					max={MAX_REST_SECONDS}
					bind:value={() => tend.state.restSeconds, (v) => tend.setRestSeconds(Number(v) || 0)}
				/>
			</div>
		</section>

		<section class="bg-card rounded-3xl p-4 shadow-border">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<h2 class="font-display text-xl tracking-tight">GLP-1 mode</h2>
					<p class="text-muted-foreground text-sm">
						Protein and fiber first. Calories quieter. Not medical advice.
					</p>
				</div>
				<Switch aria-label="GLP-1 mode" bind:checked={() => profile.glp1, setGlp1} />
			</div>
			{#if profile.glp1}
				<div class="bg-background mt-4 rounded-2xl p-3">
					<p class="text-sm font-medium">Log a dose</p>
					<div class="mt-2 grid grid-cols-2 gap-2">
						<div>
							<Label for="dose-mg">mg</Label>
							<Input id="dose-mg" class="mt-1" inputmode="decimal" bind:value={dose} />
						</div>
						<div>
							<Label for="dose-appetite">Appetite 1–5</Label>
							<Input
								id="dose-appetite"
								class="mt-1"
								type="number"
								min={1}
								max={5}
								bind:value={
									() => String(appetite),
									(v) =>
										(appetite = Math.min(5, Math.max(1, Number(v) || 3)) as Injection['appetite'])
								}
							/>
						</div>
					</div>
					<Label for="dose-notes" class="mt-2 block">Notes, side effects</Label>
					<Textarea
						id="dose-notes"
						class="mt-1 min-h-24"
						rows={2}
						bind:value={notes}
						placeholder="Nausea, constipation, quiet appetite…"
					/>
					<Button class="mt-2" size="sm" onclick={saveDose}>Save dose</Button>
					<ul class="text-muted-foreground mt-3 flex flex-col gap-1 text-sm">
						{#each profile.injections.slice(-4).reverse() as inj (inj.id)}
							<li>{inj.date} · {inj.doseMg} mg · appetite {inj.appetite}/5</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>

		<section class="bg-card rounded-3xl p-4 shadow-border">
			<h2 class="font-display text-xl tracking-tight">Targets</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				{targets.source === 'adaptive'
					? 'Updating from your weight trend and intake.'
					: targets.source === 'override'
						? 'You’re steering these by hand.'
						: 'Formula estimate until two weeks of logs exist.'}
			</p>
			<dl class="mt-3 grid grid-cols-2 gap-2 text-sm">
				{#each [['Energy', `${targets.kcal} kcal`], ['Protein', `${targets.protein} g`], ['Fiber', `${targets.fiber} g`], ['Carbs / fat', `${targets.carbs} / ${targets.fat} g`]] as const as [k, v] (k)}
					<div class="bg-background rounded-2xl px-3 py-2">
						<dt class="text-muted-foreground text-xs">{k}</dt>
						<dd class="tabular font-medium">{v}</dd>
					</div>
				{/each}
			</dl>
			<a
				href={resolve('/foods')}
				class="text-primary mt-4 inline-flex h-10 items-center text-sm font-medium"
			>
				Browse catalog with provenance
			</a>
		</section>

		<section class="bg-card rounded-3xl p-4 shadow-border">
			<h2 class="font-display text-xl tracking-tight">Privacy</h2>
			<ul class="text-muted-foreground mt-3 flex flex-col gap-2 text-sm">
				<li>No ad SDKs. No data brokers. No account required.</li>
				<li>Logs live in this browser. Nothing is sent anywhere — there is no server yet.</li>
				<li>
					USDA entries stay public-domain; Open Food Facts entries stay ODbL, never mixed inside one
					row.
				</li>
			</ul>
			<div class="mt-4 flex flex-col gap-2">
				<Button
					variant="secondary"
					onclick={() =>
						download(`fit-${todayISO()}.json`, exportJson(tend.state), 'application/json')}
				>
					Export JSON
				</Button>
				<Button
					variant="secondary"
					onclick={() =>
						download(`fit-${profile.name}-${todayISO()}.csv`, exportCsv(profile), 'text/csv')}
				>
					Export CSV
				</Button>
				<Button variant="outline" onclick={() => (wipeOpen = true)}>Delete everything</Button>
			</div>
		</section>

		<section class="bg-card rounded-3xl p-4 shadow-border">
			<h2 class="font-display text-xl tracking-tight">Import from MyFitnessPal</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Paste a diary CSV. Rows land on their own dates as custom lines you can correct.
			</p>
			<Textarea
				class="mt-3 min-h-24"
				rows={4}
				bind:value={mfp}
				aria-label="MyFitnessPal CSV"
				placeholder="Date,Meal,Name,Calories,Protein..."
			/>
			<Button class="mt-2" variant="secondary" onclick={importMfp}>Import</Button>
		</section>

		<Modal
			bind:open={wipeOpen}
			title="Delete this journal?"
			description="Everything on this device goes. There is no cloud copy. Export first if you might want it."
		>
			<div class="mt-5 flex gap-2">
				<Button variant="secondary" class="flex-1" onclick={() => (wipeOpen = false)}>Keep</Button>
				<Button
					class="flex-1"
					onclick={() => {
						tend.resetAll();
						wipeOpen = false;
					}}
				>
					Delete
				</Button>
			</div>
		</Modal>
	</div>
{/if}
