<script lang="ts">
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import { DEFAULT_REST_SECONDS } from '$lib/domain/types';
	import { formatClock } from '$lib/domain/workout';
	import { cn } from '$lib/ui/cn';

	/**
	 * The rest between sets. What is left is the distance to an end timestamp
	 * rather than a counter being decremented, so a phone that stopped firing
	 * intervals in a pocket comes back with the right time left rather than the
	 * time it went away at.
	 */
	let {
		startedAt = null,
		seconds = DEFAULT_REST_SECONDS
	}: {
		/** When the last set was ticked; a new value restarts the rest. */
		startedAt?: number | null;
		/** How long the rest runs. The session passes what the setting says. */
		seconds?: number;
	} = $props();

	let now = $state(Date.now());

	/**
	 * The paused rest: which start it belongs to, and what was left of it. Tying
	 * it to `startedAt` is what lets a newly ticked set cancel the pause without
	 * an effect reaching in to clear it.
	 */
	let paused = $state<{ startedAt: number | null; left: number } | null>(null);

	// Reassigned when the countdown is resumed, and recomputed whenever another
	// set is ticked — so a fresh rest always wins over a resumed one.
	let endsAt = $derived(startedAt === null ? null : startedAt + seconds * 1000);

	const held = $derived(paused !== null && paused.startedAt === startedAt ? paused.left : null);
	// Clamped to the full rest so a reading taken before the first tick of the
	// interval cannot show more time than the rest has.
	const left = $derived(
		held ??
			(endsAt === null ? seconds : Math.min(seconds, Math.max(0, Math.ceil((endsAt - now) / 1000))))
	);
	const running = $derived(held === null && endsAt !== null && left > 0);
	const over = $derived(left === 0);

	const label = $derived(running ? 'Resting' : over ? 'Rest over — go again' : 'Rest');
	const sub = $derived(
		running
			? 'Starts automatically when you tick a set'
			: over
				? 'Tick the next set when you are done'
				: 'Paused'
	);

	$effect(() => {
		const end = endsAt;
		if (end === null || held !== null) return;
		const id = setInterval(() => {
			now = Date.now();
			if (now >= end) clearInterval(id);
		}, 1000);
		return () => clearInterval(id);
	});

	function toggle() {
		if (running) {
			paused = { startedAt, left };
			return;
		}
		// Read what the pause was holding *before* dropping it: `paused` is what
		// `left` reads while held, so once it is null `left` recomputes against an
		// `endsAt` the wall clock has already passed. A pause longer than the rest
		// that was left would then resume at the full rest instead of the rest of it.
		const remaining = held ?? (over ? seconds : left);
		paused = null;
		now = Date.now();
		endsAt = now + remaining * 1000;
	}
</script>

<div
	class={cn(
		'flex items-center justify-between gap-3 rounded-3xl px-4 py-3',
		over ? 'bg-secondary' : 'bg-accent'
	)}
>
	<span class="min-w-0">
		<span class="text-primary block text-sm">{label}</span>
		<!-- Not `text-muted-foreground`: on the timer's tinted card it falls to a
		     4.3:1 contrast ratio, which axe fails and a gym floor makes worse. -->
		<span class="text-foreground/70 block text-xs">{sub}</span>
	</span>
	<span class="flex items-center gap-2">
		<span class="font-display tabular text-primary text-2xl">{formatClock(left)}</span>
		<button
			type="button"
			onclick={toggle}
			aria-label={running ? 'Pause rest' : 'Start rest'}
			class="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-xl"
		>
			{#if running}
				<Pause class="size-4" />
			{:else}
				<Play class="size-4" />
			{/if}
		</button>
	</span>
</div>
