<script lang="ts">
	import Modal from './Modal.svelte';

	// Modal takes its content as a snippet, which a props-only render cannot supply.
	let {
		open = $bindable(false),
		body,
		description
	}: { open?: boolean; body: string; description?: string | undefined } = $props();
</script>

<Modal bind:open title="Delete this journal?" {description}>
	<p>{body}</p>
</Modal>
