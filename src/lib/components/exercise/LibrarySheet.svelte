<script lang="ts">
	import ExercisePickRow from '$lib/components/exercise/ExercisePickRow.svelte';
	import FormCheckModal from '$lib/components/exercise/FormCheckModal.svelte';
	import { libraryFor } from '$lib/domain/exercises';
	import { MUSCLE_GROUPS, type MuscleGroup } from '$lib/domain/types';
	import Button from '$lib/ui/Button.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import ToggleButton from '$lib/ui/ToggleButton.svelte';

	/**
	 * The whole library, filtered by muscle group, picked several at a time.
	 * Selection accumulates rather than adding on each tap, so building a
	 * push day is one trip through the list instead of six.
	 */
	let {
		open = $bindable(false),
		routineName,
		taken,
		onadd,
		onclose
	}: {
		open?: boolean;
		routineName: string;
		/** What the routine already prescribes; never offered a second time. */
		taken: string[];
		onadd: (names: string[]) => void;
		onclose: () => void;
	} = $props();

	const FILTERS: { label: string; group: MuscleGroup | null }[] = [
		{ label: 'All', group: null },
		...MUSCLE_GROUPS.map((group) => ({ label: group, group }))
	];

	let group = $state<MuscleGroup | null>(null);
	let picked = $state<string[]>([]);
	let formOpen = $state(false);
	let formName = $state('');

	const items = $derived(libraryFor(group).filter((e) => !taken.includes(e.name)));
	const cta = $derived(
		picked.length === 0 ? 'Pick exercises to add' : `Add ${picked.length} to the routine`
	);

	function toggle(name: string) {
		picked = picked.includes(name) ? picked.filter((n) => n !== name) : [...picked, name];
	}

	function showForm(name: string) {
		formName = name;
		formOpen = true;
	}

	/** Leaving the sheet drops the selection; a half-made pick is not a draft. */
	function close() {
		picked = [];
		onclose();
	}

	function add() {
		onadd(picked);
		close();
	}
</script>

<Sheet bind:open title="Library" description="Adding to {routineName}" onclose={close}>
	<div class="flex flex-wrap gap-1.5 px-5 pt-3">
		{#each FILTERS as filter (filter.label)}
			<ToggleButton
				pressed={group === filter.group}
				onclick={() => (group = filter.group)}
				class="border-border text-muted-foreground h-8 rounded-full border px-3 text-xs"
			>
				{filter.label}
			</ToggleButton>
		{/each}
	</div>
	<div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
		{#each items as item (item.name)}
			<ExercisePickRow
				name={item.name}
				note={item.group}
				selected={picked.includes(item.name)}
				onpick={() => toggle(item.name)}
				onplay={() => showForm(item.name)}
			/>
		{:else}
			<p class="text-muted-foreground px-2 py-8 text-center text-sm">
				Everything the library has for this is already on the routine.
			</p>
		{/each}
	</div>
	<div class="border-border border-t px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shrink-0">
		<Button class="w-full" size="lg" disabled={picked.length === 0} onclick={add}>{cta}</Button>
	</div>
</Sheet>

<FormCheckModal bind:open={formOpen} name={formName} onclose={() => (formOpen = false)} />
