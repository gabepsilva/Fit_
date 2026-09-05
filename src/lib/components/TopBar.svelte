<script lang="ts">
	import Menu from '@lucide/svelte/icons/menu';
	import Button from '$lib/ui/Button.svelte';

	// menuOpen is reported, not owned: the shell holds the drawer; this only feeds aria-expanded.
	let {
		menuOpen,
		onmenu
	}: {
		menuOpen: boolean;
		onmenu: () => void;
	} = $props();
</script>

<header
	class="border-border bg-background/95 sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] backdrop-blur-sm"
>
	<div class="flex h-14 items-center gap-2 px-2">
		<Button
			variant="ghost"
			size="icon"
			onclick={onmenu}
			aria-label="Open menu"
			aria-haspopup="dialog"
			aria-expanded={menuOpen}
		>
			<Menu class="size-6" />
		</Button>
		<span class="font-display flex-1 text-xl tracking-tight">Fit_</span>
	</div>
</header>
