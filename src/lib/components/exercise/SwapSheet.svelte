<script lang="ts">
	import { alternativesTo, libraryExercise } from '$lib/domain/exercises';
	import Sheet from '$lib/ui/Sheet.svelte';

	/**
	 * The machine is taken, or the shoulder disagrees. Offers the rest of the
	 * same muscle group, so the session keeps its shape while one movement
	 * changes.
	 */
	let {
		open = $bindable(false),
		name,
		onclose,
		onpick
	}: {
		open?: boolean;
		name: string;
		onclose: () => void;
		onpick: (name: string) => void;
	} = $props();

	const options = $derived(alternativesTo(name));
	const group = $derived(libraryExercise(name)?.group.toLowerCase() ?? '');
	const description = $derived(
		group
			? `Machine taken? Pick another ${group} movement.`
			: 'Machine taken? Pick another movement.'
	);

	function pick(replacement: string) {
		onpick(replacement);
		onclose();
	}
</script>

<Sheet bind:open title="Swap exercise" {description} {onclose}>
	<div class="flex flex-col gap-1 overflow-y-auto px-2 pt-3 pb-6">
		{#each options as option (option.name)}
			<button
				type="button"
				onclick={() => pick(option.name)}
				class="flex min-w-0 flex-col rounded-2xl px-3 py-3 text-left"
			>
				<span class="block truncate text-sm font-medium">{option.name}</span>
				<span class="text-muted-foreground block text-xs">same group</span>
			</button>
		{:else}
			<p class="text-muted-foreground px-3 py-6 text-sm">
				Nothing else in the library trains this group.
			</p>
		{/each}
	</div>
</Sheet>
