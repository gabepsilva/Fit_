<script lang="ts">
	import Play from '@lucide/svelte/icons/play';
	import { resolve } from '$app/paths';
	import type { Workout } from '$lib/domain/types';
	import { workoutSetsDone } from '$lib/domain/workout';

	/**
	 * The way back into a session that was walked away from. A workout with
	 * nothing ticked is not worth interrupting the page for.
	 */
	let { workout }: { workout: Workout | null } = $props();

	const resume = $derived.by(() => {
		if (!workout) return null;
		const done = workoutSetsDone(workout);
		if (done === 0) return null;
		return {
			title: `${workout.routineName} in progress`,
			logged: `${done} ${done === 1 ? 'set' : 'sets'} logged`
		};
	});
</script>

{#if resume}
	<a
		href={resolve('/exercise/session')}
		class="bg-accent flex items-center gap-3 rounded-2xl px-4 py-3"
	>
		<span
			class="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl"
		>
			<Play class="size-4" fill="currentColor" />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block truncate text-sm font-medium">{resume.title}</span>
			<span class="text-primary block text-xs">{resume.logged}</span>
		</span>
		<span class="text-primary shrink-0 text-xs">Resume</span>
	</a>
{/if}
