<script lang="ts">
	import PageHeader from './PageHeader.svelte';

	// The lead sentence is a snippet, which a props-only render cannot supply.
	let { kicker, title, lead }: { kicker: string; title: string; lead?: string | undefined } =
		$props();
</script>

{#if lead}
	<PageHeader {kicker} {title}>{lead}</PageHeader>
{:else}
	<PageHeader {kicker} {title} />
{/if}
