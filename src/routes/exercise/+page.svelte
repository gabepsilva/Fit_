<script lang="ts">
	import Dumbbell from '@lucide/svelte/icons/dumbbell';
	import PageHeader from '$lib/components/PageHeader.svelte';
</script>

<svelte:head>
	<title>Exercise · Fit_</title>
</svelte:head>

<div class="flex flex-col gap-6 pb-10">
	<PageHeader kicker="Movement, not penance" title="Exercise" />

	<section
		class="bg-card flex flex-col items-center gap-3 rounded-3xl px-5 py-10 text-center shadow-border"
	>
		<span
			class="bg-secondary text-muted-foreground flex size-14 items-center justify-center rounded-2xl"
		>
			<Dumbbell class="size-6" />
		</span>
		<h2 class="font-display text-xl tracking-tight">Coming soon</h2>
		<p class="text-muted-foreground max-w-xs text-sm">
			Somewhere to note what you moved, without turning it into another number to chase. Nothing to
			log here yet.
		</p>
	</section>
</div>
