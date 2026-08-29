<script lang="ts">
	import Play from '@lucide/svelte/icons/play';
	import { formCues } from '$lib/domain/exercises';
	import Button from '$lib/ui/Button.svelte';
	import Modal from '$lib/ui/Modal.svelte';

	/**
	 * Three things to watch, for the movement you are about to do badly. The
	 * demonstration itself is a placeholder and says so: a panel that looked like
	 * a video player but never played would be worse than an honest gap.
	 */
	let {
		open = $bindable(false),
		name,
		onclose
	}: { open?: boolean; name: string; onclose: () => void } = $props();

	const cues = $derived(formCues(name));
</script>

<Modal bind:open title={name} description="Form check">
	<div
		class="bg-secondary text-foreground/70 mt-4 flex aspect-video flex-col items-center justify-center gap-2 rounded-2xl"
	>
		<Play class="size-6" />
		<p class="text-xs">A demonstration clip belongs here</p>
	</div>
	<ul class="mt-4 flex flex-col gap-2.5">
		{#each cues as cue, i (cue)}
			<li class="flex items-start gap-2.5">
				<span
					class="bg-accent text-accent-foreground tabular mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-lg text-xs font-medium"
				>
					{i + 1}
				</span>
				<span class="text-sm leading-snug">{cue}</span>
			</li>
		{/each}
	</ul>
	<Button class="mt-5 w-full" onclick={onclose}>Got it</Button>
</Modal>
