<script lang="ts">
	import Camera from '@lucide/svelte/icons/camera';
	import Menu from '@lucide/svelte/icons/menu';
	import Plus from '@lucide/svelte/icons/plus';
	import Button from '$lib/ui/Button.svelte';

	/**
	 * `menuOpen` is reported rather than owned: the shell holds the drawer state,
	 * and the button only needs it to describe itself to assistive technology.
	 */
	let {
		menuOpen,
		onmenu,
		onphoto,
		onlog
	}: {
		menuOpen: boolean;
		onmenu: () => void;
		onphoto: () => void;
		onlog: () => void;
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
		<Button variant="ghost" size="icon" onclick={onphoto} aria-label="Log from a photo">
			<Camera class="size-6" />
		</Button>
		<Button size="icon" class="shadow-border rounded-full" onclick={onlog} aria-label="Log food">
			<Plus class="size-5" />
		</Button>
	</div>
</header>
