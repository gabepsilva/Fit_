import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import PhotoCapture from './PhotoCapture.svelte';

/** Long enough for a real video element to receive its first frame. */
const FRAME = { timeout: 5000 };

const painters: number[] = [];

/**
 * `navigator.mediaDevices` is a prototype getter, so an own property shadows it
 * for the length of a test and `delete` puts the real one back.
 */
function stubMediaDevices(value: unknown) {
	Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value });
}

/** A still canvas emits no frames, so it repaints on a timer. */
function paintingStream() {
	const canvas = document.createElement('canvas');
	canvas.width = 320;
	canvas.height = 240;
	const context = canvas.getContext('2d');
	let tick = 0;
	painters.push(
		setInterval(() => {
			if (!context) return;
			context.fillStyle = tick++ % 2 ? '#3f5a48' : '#f3eee4';
			context.fillRect(0, 0, canvas.width, canvas.height);
		}, 30) as unknown as number
	);
	return canvas.captureStream(30);
}

function openable() {
	const stream = paintingStream();
	stubMediaDevices({ getUserMedia: vi.fn(() => Promise.resolve(stream)) });
	return stream;
}

function failing(name: string) {
	stubMediaDevices({
		getUserMedia: vi.fn(() => Promise.reject(new DOMException('no', name)))
	});
}

const shutter = () => page.getByRole('button', { name: 'Take the picture' });

const camera = () => render(PhotoCapture, { props: { route: 'camera', ontype: vi.fn() } });
const upload = () => render(PhotoCapture, { props: { route: 'file', ontype: vi.fn() } });

async function shoot() {
	await expect.element(shutter(), FRAME).toBeEnabled();
	await shutter().click();
}

/** A real encoded picture, the way one arrives from the gallery. */
async function pictureFile(width = 320, height = 240) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (context) {
		context.fillStyle = '#3f5a48';
		context.fillRect(0, 0, width, height);
	}
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
	if (!blob) throw new Error('the canvas produced no blob');
	return new File([blob], 'plate.png', { type: 'image/png' });
}

/** The browser opens the picker outside the page, so no test can drive it. */
function choose(file: File) {
	const input = document.querySelector('input[type="file"]');
	if (!(input instanceof HTMLInputElement)) throw new Error('no file input was rendered');
	const data = new DataTransfer();
	data.items.add(file);
	input.files = data.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(() => {
	for (const painter of painters.splice(0)) clearInterval(painter);
	delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
	vi.restoreAllMocks();
});

describe('PhotoCapture, pointed at the camera', () => {
	it('opens the camera with the pane, rather than behind another button', async () => {
		const getUserMedia = vi.fn(() => Promise.resolve(paintingStream()));
		stubMediaDevices({ getUserMedia });
		await camera();
		await expect.element(page.getByLabelText('Camera viewfinder')).toBeInTheDocument();
		expect(getUserMedia).toHaveBeenCalled();
	});

	it('holds the shutter until the camera is producing frames', async () => {
		openable();
		await camera();
		await expect.element(shutter(), FRAME).toBeEnabled();
	});

	it('shows what the camera saw after the shutter', async () => {
		openable();
		await camera();
		await shoot();
		await expect.element(page.getByAltText('What the camera just saw')).toBeInTheDocument();
	});

	it('captures an actual frame rather than an empty one', async () => {
		openable();
		await camera();
		await shoot();
		const src = document.querySelector('img')?.getAttribute('src') ?? '';
		expect(src.startsWith('data:image/jpeg;base64,')).toBe(true);
	});

	it('says up front that nothing leaves the device', async () => {
		openable();
		await camera();
		expect(document.body.textContent).toContain('nothing leaves this device');
	});

	it('says plainly that reading the still needs a server that does not exist', async () => {
		openable();
		await camera();
		await shoot();
		expect(document.body.textContent).toContain('needs the server, which isn’t built yet');
	});

	it('lets go of the camera as soon as there is a still', async () => {
		const stream = openable();
		const stops = stream.getTracks().map((track) => vi.spyOn(track, 'stop'));
		await camera();
		await shoot();
		expect(stops.every((stop) => stop.mock.calls.length > 0)).toBe(true);
	});

	it('lets go of the camera when the pane goes away', async () => {
		const stream = openable();
		const stops = stream.getTracks().map((track) => vi.spyOn(track, 'stop'));
		const pane = await camera();
		await expect.element(shutter(), FRAME).toBeEnabled();
		await pane.unmount();
		expect(stops.every((stop) => stop.mock.calls.length > 0)).toBe(true);
	});

	it('goes back to the viewfinder to retake', async () => {
		openable();
		await camera();
		await shoot();
		await page.getByRole('button', { name: 'Retake' }).click();
		await expect.element(page.getByLabelText('Camera viewfinder')).toBeInTheDocument();
	});

	it('sends the user to typing when they ask for it', async () => {
		openable();
		const ontype = vi.fn();
		await render(PhotoCapture, { props: { route: 'camera', ontype } });
		await page.getByRole('button', { name: 'Type it instead' }).click();
		expect(ontype).toHaveBeenCalled();
	});

	it('names a declined permission and how to undo it', async () => {
		failing('NotAllowedError');
		await camera();
		await expect.element(page.getByText(/undo that in your settings/)).toBeInTheDocument();
	});

	it('says when the camera could not be opened at all', async () => {
		failing('NotReadableError');
		await camera();
		await expect.element(page.getByText(/wouldn’t open/)).toBeInTheDocument();
	});

	it('says when the browser has no camera to offer', async () => {
		stubMediaDevices(undefined);
		await camera();
		await expect.element(page.getByText(/doesn’t offer a camera/)).toBeInTheDocument();
	});

	it('reaches the viewfinder when a second attempt succeeds', async () => {
		failing('NotAllowedError');
		await camera();
		await expect.element(page.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
		openable();
		await page.getByRole('button', { name: 'Try again' }).click();
		await expect.element(page.getByLabelText('Camera viewfinder')).toBeInTheDocument();
	});
});

describe('PhotoCapture, pointed at the pictures already on the device', () => {
	it('opens the picker with the pane, rather than behind another button', async () => {
		const opened = vi.spyOn(HTMLInputElement.prototype, 'click');
		await upload();
		expect(opened).toHaveBeenCalled();
	});

	it('opens no camera at all', async () => {
		const getUserMedia = vi.fn(() => Promise.resolve(paintingStream()));
		stubMediaDevices({ getUserMedia });
		await upload();
		await expect
			.element(page.getByRole('button', { name: 'Choose a picture' }))
			.toBeInTheDocument();
		expect(getUserMedia).not.toHaveBeenCalled();
	});

	it('shows the picture that was chosen', async () => {
		await upload();
		choose(await pictureFile());
		await expect.element(page.getByAltText('The picture you chose')).toBeInTheDocument();
	});

	it('offers another pick, not a retake, for a picture that was chosen', async () => {
		await upload();
		choose(await pictureFile());
		await expect.element(page.getByRole('button', { name: 'Choose another' })).toBeInTheDocument();
	});

	it('offers a way back to the picker when it is dismissed unanswered', async () => {
		await upload();
		await expect
			.element(page.getByRole('button', { name: 'Choose a picture' }))
			.toBeInTheDocument();
	});

	it('says so when the chosen file is not a picture', async () => {
		await upload();
		choose(new File(['not a picture'], 'notes.txt', { type: 'text/plain' }));
		await expect.element(page.getByText(/isn’t a picture/)).toBeInTheDocument();
	});

	it('says so when the chosen picture will not decode', async () => {
		await upload();
		choose(new File([new Uint8Array([1, 2, 3])], 'broken.png', { type: 'image/png' }));
		await expect.element(page.getByText(/couldn’t be read/)).toBeInTheDocument();
	});

	it('says here too that nothing leaves the device', async () => {
		await upload();
		expect(document.body.textContent).toContain('nothing leaves this device');
	});

	it('sends the user to typing when they ask for it', async () => {
		const ontype = vi.fn();
		await render(PhotoCapture, { props: { route: 'file', ontype } });
		await page.getByRole('button', { name: 'Type it instead' }).click();
		expect(ontype).toHaveBeenCalled();
	});
});
