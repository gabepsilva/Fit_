<script lang="ts">
	import Play from '@lucide/svelte/icons/play';
	import { resolve } from '$app/paths';
	import type { Workout } from '$lib/domain/types';
	import { elapsedSeconds, formatDuration, workoutSetsDone } from '$lib/domain/workout';

	/**
	 * The way back into a session that was walked away from. A workout with
	 * nothing ticked is not worth interrupting the page for.
	 */
	let { workout }: { workout: Workout | null } = $props();

	/**
	 * How often the "ago" reading is retaken. This is a coarse reading of how
	 * long a session has been abandoned — minutes and hours are what it is read
	 * for — so it is not worth waking the home screen sixty times a minute to
	 * keep the last digit honest. Ten seconds is close enough that the reading
	 * is never visibly wrong, and it is exact the moment the screen appears
	 * because the clock is read at mount rather than counted up from zero.
	 */
	const TICK_MS = 10_000;

	let now = $state(Date.now());

	/** Read off the workout alone, so a tick of the clock cannot restart the interval. */
	const done = $derived(workout ? workoutSetsDone(workout) : 0);

	const resume = $derived.by(() => {
		if (!workout || done === 0) return null;
		const ago = formatDuration(elapsedSeconds(workout, now));
		return {
			title: `${workout.routineName} in progress`,
			sub: `${done} ${done === 1 ? 'set' : 'sets'} logged · ${ago} ago`
		};
	});

	$effect(() => {
		if (done === 0) return;
		const id = setInterval(() => (now = Date.now()), TICK_MS);
		return () => clearInterval(id);
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
			<span class="text-primary block text-xs">{resume.sub}</span>
		</span>
		<span class="text-primary shrink-0 text-xs">Resume</span>
	</a>
{/if}
