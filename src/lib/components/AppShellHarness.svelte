<script lang="ts">
	import AppShell from './AppShell.svelte';

	// A props-only render cannot supply the snippet AppShell expects as its page.
	let { body }: { body: string } = $props();
</script>

<AppShell>
	<p>{body}</p>
</AppShell>
