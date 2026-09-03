// `getUserMedia` is missing on insecure origins; failures are reasons, never exceptions.

export type CameraFailure = 'unsupported' | 'denied' | 'unavailable';

export type CameraResult =
	{ ok: true; stream: MediaStream; stop: () => void } | { ok: false; reason: CameraFailure };

export async function startCamera(): Promise<CameraResult> {
	const media = globalThis.navigator?.mediaDevices;
	if (!media?.getUserMedia) return { ok: false, reason: 'unsupported' };
	try {
		// `ideal`, not `exact`: a front-camera-only device should still open.
		const stream = await media.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
		return {
			ok: true,
			stream,
			stop: () => {
				for (const track of stream.getTracks()) track.stop();
			}
		};
	} catch (error) {
		// `denied` is its own reason: it is the only failure the user can undo.
		const denied = error instanceof DOMException && error.name === 'NotAllowedError';
		return { ok: false, reason: denied ? 'denied' : 'unavailable' };
	}
}

export const CAPTURE_MAX_EDGE = 720;

// Sized here, once: a full-resolution sensor frame would be a multi-megabyte string.
function toScaledJpeg(
	source: CanvasImageSource,
	width: number,
	height: number,
	maxEdge: number
): string | null {
	if (!width || !height) return null;

	const scale = Math.min(1, maxEdge / Math.max(width, height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(width * scale);
	canvas.height = Math.round(height * scale);

	const context = canvas.getContext('2d');
	if (!context) return null;
	context.drawImage(source, 0, 0, canvas.width, canvas.height);
	return canvas.toDataURL('image/jpeg', 0.82);
}

export function captureFrame(video: HTMLVideoElement, maxEdge = CAPTURE_MAX_EDGE): string | null {
	return toScaledJpeg(video, video.videoWidth, video.videoHeight, maxEdge);
}

export type PickFailure = 'not-an-image' | 'unreadable';

export type PickResult = { ok: true; shot: string } | { ok: false; reason: PickFailure };

// Emits the same JPEG data URL the camera path does; the file is decoded
// on-device and never uploaded.
export async function readImageFile(file: File, maxEdge = CAPTURE_MAX_EDGE): Promise<PickResult> {
	// `accept` filters the picker; it does not constrain what comes back from it.
	if (!file.type.startsWith('image/')) return { ok: false, reason: 'not-an-image' };

	const url = URL.createObjectURL(file);
	try {
		const image = new Image();
		image.src = url;
		// `decode()` rejects a broken file; a `load` listener would never fire.
		await image.decode();
		const shot = toScaledJpeg(image, image.naturalWidth, image.naturalHeight, maxEdge);
		return shot ? { ok: true, shot } : { ok: false, reason: 'unreadable' };
	} catch {
		return { ok: false, reason: 'unreadable' };
	} finally {
		// Revoke once drawn: the still no longer needs the object URL.
		URL.revokeObjectURL(url);
	}
}
