/**
 * A thin wrapper over `getUserMedia`, which is missing on insecure origins and
 * can be declined by the person holding the phone. Callers get a reason rather
 * than an exception, so the interface can say what went wrong and offer typing
 * instead.
 */

/** Why the camera did not open. */
export type CameraFailure = 'unsupported' | 'denied' | 'unavailable';

export type CameraResult =
	{ ok: true; stream: MediaStream; stop: () => void } | { ok: false; reason: CameraFailure };

export async function startCamera(): Promise<CameraResult> {
	const media = globalThis.navigator?.mediaDevices;
	if (!media?.getUserMedia) return { ok: false, reason: 'unsupported' };
	try {
		// `ideal` rather than `exact`: the rear camera is the one pointed at the
		// plate, but a laptop with only a front camera should still open.
		const stream = await media.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
		return {
			ok: true,
			stream,
			stop: () => {
				for (const track of stream.getTracks()) track.stop();
			}
		};
	} catch (error) {
		// A declined permission is worth saying out loud, because it is the one
		// failure the person can undo themselves.
		const denied = error instanceof DOMException && error.name === 'NotAllowedError';
		return { ok: false, reason: denied ? 'denied' : 'unavailable' };
	}
}

/** The longest edge a captured frame is scaled to, in pixels. */
export const CAPTURE_MAX_EDGE = 720;

/**
 * The one place a still is sized and encoded, whether it came from the camera
 * or from the gallery: a full-resolution phone sensor would otherwise produce a
 * several-megabyte string. Returns `null` when the source has no size to draw
 * yet, or when the canvas refuses a context.
 */
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

/**
 * Copy the frame currently showing in `video` into a JPEG data URL, scaled down
 * to `maxEdge`. Returns `null` before the stream reports its dimensions.
 */
export function captureFrame(video: HTMLVideoElement, maxEdge = CAPTURE_MAX_EDGE): string | null {
	return toScaledJpeg(video, video.videoWidth, video.videoHeight, maxEdge);
}

/** Why a chosen file did not become a still. */
export type PickFailure = 'not-an-image' | 'unreadable';

export type PickResult = { ok: true; shot: string } | { ok: false; reason: PickFailure };

/**
 * Turn a file chosen from the gallery into the same kind of JPEG data URL the
 * camera produces, so a picked photo and a taken one are the same thing from
 * there on. Nothing is uploaded: the file is decoded and redrawn on this device.
 */
export async function readImageFile(file: File, maxEdge = CAPTURE_MAX_EDGE): Promise<PickResult> {
	// `accept` filters the picker; it does not constrain what comes back from it.
	if (!file.type.startsWith('image/')) return { ok: false, reason: 'not-an-image' };

	const url = URL.createObjectURL(file);
	try {
		const image = new Image();
		image.src = url;
		// `decode` reports a broken or unsupported file as a rejection, where
		// waiting on `load` would simply never resolve.
		await image.decode();
		const shot = toScaledJpeg(image, image.naturalWidth, image.naturalHeight, maxEdge);
		return shot ? { ok: true, shot } : { ok: false, reason: 'unreadable' };
	} catch {
		return { ok: false, reason: 'unreadable' };
	} finally {
		// The blob stays alive as long as the URL does, and the still no longer
		// needs it: it has already been drawn onto the canvas.
		URL.revokeObjectURL(url);
	}
}
