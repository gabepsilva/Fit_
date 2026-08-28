<script lang="ts">
	import AppShell from './AppShell.svelte';

	// AppShell takes the page as a snippet, which a props-only render cannot supply.
	let { body }: { body: string } = $props();
</script>

<AppShell>
	<p>{body}</p>
</AppShell>
