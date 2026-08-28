<script lang="ts">
	import Camera from '@lucide/svelte/icons/camera';
	import ImageUp from '@lucide/svelte/icons/image-up';
	import { onDestroy, onMount } from 'svelte';
	import {
		captureFrame,
		readImageFile,
		startCamera,
		type CameraFailure,
		type PickFailure
	} from '$lib/ui/camera';
	import Button from '$lib/ui/Button.svelte';

	/**
	 * `camera` opens the viewfinder, `file` opens the picker — each as soon as
	 * the pane appears, because the tab that created it was the decision. There
	 * is no menu in between.
	 */
	let { route, ontype }: { route: 'camera' | 'file'; ontype: () => void } = $props();

	/**
	 * `ready` is the resting state at either end: the camera is opening, or the
	 * picker is open and waiting to be answered.
	 */
	type Phase = 'ready' | 'live' | 'reading' | 'shot' | 'failed';

	const TROUBLE: Record<CameraFailure | PickFailure, string> = {
		unsupported: 'This browser doesn’t offer a camera.',
		denied: 'Camera access was declined. Your browser’s site settings can undo that.',
		unavailable: 'The camera wouldn’t open. Something else may be using it.',
		'not-an-image': 'That file isn’t a picture.',
		unreadable: 'That picture couldn’t be read.'
	};

	let phase = $state<Phase>('ready');
	let failure = $state<CameraFailure | PickFailure>('unavailable');
	let shot = $state<string | null>(null);
	let stream = $state<MediaStream | null>(null);
	// A readonly binding: zero until the stream reports its size, which is also
	// the first moment there is a frame worth capturing.
	let videoWidth = $state(0);
	let stopStream: (() => void) | null = null;
	let grabFrame: (() => string | null) | null = null;
	let picker: HTMLInputElement | null = null;

	const Icon = $derived(route === 'camera' ? Camera : ImageUp);

	/**
	 * Hand the live stream to the element and keep a way to read a frame from it.
	 * An attachment rather than `bind:this` so both are undone the moment the
	 * viewfinder leaves the page.
	 */
	function viewfinder(source: MediaStream | null) {
		return (node: HTMLVideoElement) => {
			node.srcObject = source;
			grabFrame = () => captureFrame(node);
			return () => {
				node.srcObject = null;
				grabFrame = null;
			};
		};
	}

	/**
	 * Opening the picker from the attachment rather than from `onMount` is what
	 * guarantees the input exists by the time it is asked to open.
	 */
	function filePicker(node: HTMLInputElement) {
		picker = node;
		node.click();
		return () => {
			picker = null;
		};
	}

	function release() {
		stopStream?.();
		stopStream = null;
		stream = null;
	}

	async function open() {
		phase = 'ready';
		videoWidth = 0;
		const result = await startCamera();
		if (!result.ok) {
			failure = result.reason;
			phase = 'failed';
			return;
		}
		stopStream = result.stop;
		stream = result.stream;
		phase = 'live';
	}

	function choose() {
		picker?.click();
	}

	async function chosen() {
		const input = picker;
		const file = input?.files?.[0];
		// Clearing the input is what makes choosing the *same* picture twice count
		// as a second change rather than as nothing at all.
		if (input) input.value = '';
		if (!file) return;

		phase = 'reading';
		const result = await readImageFile(file);
		if (!result.ok) {
			failure = result.reason;
			phase = 'failed';
			return;
		}
		shot = result.shot;
		phase = 'shot';
	}

	function shoot() {
		const taken = grabFrame?.() ?? null;
		if (!taken) return;
		shot = taken;
		// The camera is released as soon as there is a still: leaving the indicator
		// light on while someone studies a frozen frame is its own small betrayal.
		release();
		phase = 'shot';
	}

	/** Another go, down whichever route this pane is. */
	function again() {
		if (route === 'file') {
			choose();
			return;
		}
		shot = null;
		void open();
	}

	function typeInstead() {
		release();
		shot = null;
		ontype();
	}

	// The camera opens with the pane, so it closes with it too: leaving the photo
	// tab, closing the sheet, and navigating away all land here.
	onDestroy(release);
	onMount(() => {
		if (route === 'camera') void open();
	});
</script>

<div class="bg-background flex flex-col items-center gap-3 rounded-3xl px-4 py-6 text-center">
	{#if route === 'file'}
		<input {@attach filePicker} type="file" accept="image/*" class="hidden" onchange={chosen} />
	{/if}

	{#if phase === 'live'}
		<video
			{@attach viewfinder(stream)}
			bind:videoWidth
			autoplay
			playsinline
			muted
			aria-label="Camera viewfinder"
			class="bg-secondary aspect-[3/4] w-full max-w-xs rounded-2xl object-cover"
		></video>
		<Button onclick={shoot} disabled={videoWidth === 0}>
			{videoWidth === 0 ? 'Waking the camera…' : 'Take the picture'}
		</Button>
	{:else if phase === 'shot' && shot}
		<img
			src={shot}
			alt={route === 'camera' ? 'What the camera just saw' : 'The picture you chose'}
			class="aspect-[3/4] w-full max-w-xs rounded-2xl object-cover"
		/>
		<Button variant="secondary" onclick={again}>
			{route === 'camera' ? 'Retake' : 'Choose another'}
		</Button>
	{:else if phase === 'failed'}
		<Icon class="text-muted-foreground size-8" />
		<p class="text-muted-foreground max-w-xs text-sm">{TROUBLE[failure]}</p>
		<Button variant="secondary" onclick={again}>Try again</Button>
	{:else if route === 'file' && phase === 'ready'}
		<!-- The picker is already open. This is the way back when it is dismissed. -->
		<Icon class="text-muted-foreground size-8" />
		<Button onclick={choose}>Choose a picture</Button>
	{:else}
		<Icon class="text-muted-foreground size-8" />
		<p class="text-muted-foreground max-w-xs text-sm">
			{phase === 'reading' ? 'Opening the picture…' : 'Opening the camera…'}
		</p>
	{/if}

	<!-- One sentence per line: the tests match this copy, and a reflow must not split it. -->
	<p class="text-muted-foreground max-w-xs text-sm">
		Reading a still needs the server, which isn’t built yet, so nothing leaves this device.
	</p>
	<Button variant="quiet" size="sm" onclick={typeInstead}>Type it instead</Button>
</div>
