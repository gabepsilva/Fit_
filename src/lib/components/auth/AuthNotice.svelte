<script lang="ts">
	/**
	 * What went wrong with the whole submission, above the form.
	 *
	 * `role="alert"` rather than a paragraph that merely appears: the person who
	 * pressed the button has their focus on the button, and a message rendered
	 * silently below the heading is one a screen reader never mentions. The
	 * element is created when there is something to say and removed when there
	 * is not, which is what makes the live region announce.
	 */
	let { message }: { message: string } = $props();
</script>

<p role="alert" class="bg-secondary text-destructive rounded-2xl px-4 py-3 text-sm">{message}</p>
