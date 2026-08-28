<script lang="ts">
	import Camera from '@lucide/svelte/icons/camera';
	import Menu from '@lucide/svelte/icons/menu';
	import Plus from '@lucide/svelte/icons/plus';

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
		<button
			type="button"
			onclick={onmenu}
			aria-label="Open menu"
			aria-haspopup="dialog"
			aria-expanded={menuOpen}
			class="text-foreground hover:bg-secondary flex size-11 items-center justify-center rounded-xl transition-transform duration-150 active:scale-[0.96]"
		>
			<Menu class="size-6" />
		</button>
		<span class="font-display flex-1 text-xl tracking-tight">Fit_</span>
		<button
			type="button"
			onclick={onphoto}
			aria-label="Log from a photo"
			class="text-foreground hover:bg-secondary flex size-11 items-center justify-center rounded-xl transition-transform duration-150 active:scale-[0.96]"
		>
			<Camera class="size-6" />
		</button>
		<button
			type="button"
			onclick={onlog}
			aria-label="Log food"
			class="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-full shadow-[var(--shadow-border)] transition-transform duration-150 active:scale-[0.96]"
		>
			<Plus class="size-5" />
		</button>
	</div>
</header>
