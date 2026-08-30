<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Input from '$lib/ui/Input.svelte';
	import Label from '$lib/ui/Label.svelte';

	/**
	 * One box on an authentication form: its label, the input, and whatever the
	 * server said about it.
	 *
	 * The wiring is the reason this exists rather than being typed out twice. A
	 * rejection has to reach a screen reader as well as an eye, which means
	 * `aria-invalid` on the input and `aria-describedby` pointing at the message
	 * — and the hint it replaces has to be described the same way, or the rule
	 * a field is failing is announced only while it is passing.
	 */
	let {
		id,
		label,
		value = $bindable(''),
		error,
		hint,
		...rest
	}: Omit<HTMLInputAttributes, 'value'> & {
		id: string;
		label: string;
		value?: string;
		/** What the server said is wrong with this field, if anything. */
		error?: string | undefined;
		/** The rule, shown while the field has not been rejected. */
		hint?: string | undefined;
	} = $props();

	const described = $derived(error !== undefined ? `${id}-note` : hint ? `${id}-note` : undefined);
</script>

<div>
	<Label for={id}>{label}</Label>
	<Input
		{...rest}
		{id}
		bind:value
		class="mt-1.5"
		aria-invalid={error === undefined ? undefined : 'true'}
		aria-describedby={described}
	/>
	{#if error !== undefined}
		<p id="{id}-note" class="text-destructive mt-1.5 text-xs">{error}</p>
	{:else if hint}
		<p id="{id}-note" class="text-muted-foreground mt-1.5 text-xs">{hint}</p>
	{/if}
</div>
