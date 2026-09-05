<script lang="ts">
	import Camera from '@lucide/svelte/icons/camera';
	import ImageUp from '@lucide/svelte/icons/image-up';
	import { onDestroy, onMount } from 'svelte';
	import { readPhoto, type PhotoFood } from '$lib/photo/photo-log';
	import type { Meal } from '$lib/domain/types';
	import {
		captureFrame,
		readImageFile,
		startCamera,
		type CameraFailure,
		type PickFailure
	} from '$lib/ui/camera';
	import Button from '$lib/ui/Button.svelte';

	// The camera or picker opens at once: the tab the user picked was already the decision.
	let {
		route,
		meal,
		ontype,
		onfoods
	}: {
		route: 'camera' | 'file';
		/** Travels with the still, so the model estimates a breakfast portion as one. */
		meal: Meal;
		ontype: () => void;
		onfoods: (foods: PhotoFood[]) => void;
	} = $props();

	type Phase = 'ready' | 'live' | 'reading' | 'shot' | 'failed';

	const TROUBLE: Record<CameraFailure | PickFailure, string> = {
		// This message names the browser; the app serves https://localhost, so it never fires there.
		unsupported: 'This browser doesn’t offer a camera.',
		// Names neither way back: site settings in a browser, app permissions on Android.
		denied: 'Camera access was declined. You can undo that in your settings.',
		unavailable: 'The camera wouldn’t open. Something else may be using it.',
		'not-an-image': 'That file isn’t a picture.',
		unreadable: 'That picture couldn’t be read.'
	};

	/**
	 * Every ending that is not a plate of foods. `none` is the model reading the
	 * picture and finding no food in it, which is worth retaking; the rest are
	 * the server, which is not. All of them name typing, because that path is
	 * always open.
	 */
	const REFUSED = {
		none: 'Couldn’t recognise any food in that photo. Try closer, or type it.',
		unauthenticated: 'Reading a photo needs you to be signed in. You can still type it.',
		'too-large': 'That photo is too large to read.',
		unavailable: 'Photo logging isn’t available right now. You can still type it.',
		quota: 'That’s all the photos this app can read today. You can still type it.',
		offline: 'The photo couldn’t be sent. You can still type it.'
	};

	let phase = $state<Phase>('ready');
	let failure = $state<CameraFailure | PickFailure>('unavailable');
	let shot = $state<string | null>(null);
	let stream = $state<MediaStream | null>(null);
	/** Set while the still is with the server; the button is the only thing that says so. */
	let sending = $state(false);
	/** What the last attempt at reading came to, when it came to nothing. */
	let refused = $state<string | null>(null);
	// Zero until the stream reports its size: the first moment there is a frame to capture.
	let videoWidth = $state(0);
	let stopStream: (() => void) | null = null;
	let grabFrame: (() => string | null) | null = null;
	let picker: HTMLInputElement | null = null;

	const Icon = $derived(route === 'camera' ? Camera : ImageUp);

	// An attachment, not bind:this, so the stream and grabber are undone when the viewfinder leaves.
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

	// Opened from the attachment, not onMount, so the input exists by the time it is clicked.
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
		// Clear the value so re-picking the same picture still fires a change.
		if (input) input.value = '';
		if (!file) return;

		phase = 'reading';
		refused = null;
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
		refused = null;
		// Release as soon as there is a still, so the camera indicator goes off.
		release();
		phase = 'shot';
	}

	/**
	 * Send the still to be read. A plate with foods on it leaves this pane
	 * entirely — the proposals are the answer, and they live in the sheet. Every
	 * other ending stays here with a sentence and the picture still on screen,
	 * so retaking is one tap away.
	 */
	async function send() {
		if (shot === null || sending) return;
		sending = true;
		refused = null;
		const outcome = await readPhoto(shot, meal);
		sending = false;
		if (outcome.kind !== 'ok') {
			refused = REFUSED[outcome.kind];
			return;
		}
		if (outcome.foods.length === 0) {
			refused = REFUSED.none;
			return;
		}
		onfoods(outcome.foods);
	}

	function again() {
		refused = null;
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

	// Closes with the pane on every exit: tab change, sheet close, navigation.
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
		<!-- Said before the button, not after it: this is the moment the picture would leave. -->
		<p class="text-muted-foreground max-w-xs text-sm">
			The photo goes to OpenAI to be read. It isn’t stored.
		</p>
		<Button onclick={send} disabled={sending}>
			{sending ? 'Reading the plate…' : 'Read this plate'}
		</Button>
		<Button variant="secondary" onclick={again} disabled={sending}>
			{route === 'camera' ? 'Retake' : 'Choose another'}
		</Button>
	{:else if phase === 'failed'}
		<Icon class="text-muted-foreground size-8" />
		<p class="text-muted-foreground max-w-xs text-sm">{TROUBLE[failure]}</p>
		<Button variant="secondary" onclick={again}>Try again</Button>
	{:else if route === 'file' && phase === 'ready'}
		<!-- The picker was dismissed: the only way back is to open it again. -->
		<Icon class="text-muted-foreground size-8" />
		<Button onclick={choose}>Choose a picture</Button>
	{:else}
		<Icon class="text-muted-foreground size-8" />
		<p class="text-muted-foreground max-w-xs text-sm">
			{phase === 'reading' ? 'Opening the picture…' : 'Opening the camera…'}
		</p>
	{/if}

	{#if refused}
		<p class="text-muted-foreground max-w-xs text-sm">{refused}</p>
	{/if}

	<Button variant="quiet" size="sm" onclick={typeInstead}>Type it instead</Button>
</div>
