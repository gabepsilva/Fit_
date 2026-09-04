import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { emptyProfile } from '$lib/domain/profile';
import { FOOD_BY_BARCODE } from '$lib/domain/foods';
import { logUi } from '$lib/state/log-ui.svelte';
import { tend } from '$lib/state/tend.svelte';
import LogSheet from './LogSheet.svelte';

const DEMO_BARCODE = '602652171032';

/** A stream with real frames: a canvas can produce one without a camera. */
function fakeStream() {
	const canvas = document.createElement('canvas');
	canvas.width = 320;
	canvas.height = 240;
	return canvas.captureStream(1);
}

function onboard() {
	tend.resetAll();
	tend.completeOnboarding({
		profile: emptyProfile({ name: 'Alex' }),
		household: false,
		useSample: false
	});
}

async function openSheet() {
	await render(LogSheet);
	logUi.open = true;
	await expect.element(page.getByRole('dialog')).toBeInTheDocument();
}

afterEach(() => {
	delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
});

beforeEach(() => {
	localStorage.clear();
	logUi.open = false;
	logUi.tab = 'type';
	vi.restoreAllMocks();
	onboard();
});

describe('LogSheet', () => {
	it('stays closed until asked', async () => {
		await render(LogSheet);
		expect(document.body.textContent).not.toContain('Tend proposes');
	});

	it('states its contract when opened', async () => {
		await openSheet();
		expect(document.body.textContent).toContain('Tend proposes. You correct in one tap.');
	});

	it('opens on the typing tab', async () => {
		await openSheet();
		await expect
			.element(page.getByPlaceholder('two eggs, toast, black coffee'))
			.toBeInTheDocument();
	});

	it('opens on the photo tab when the camera asked for it', async () => {
		await render(LogSheet);
		logUi.show('photo');
		await expect
			.element(page.getByText(/needs the server, which isn’t built yet/))
			.toBeInTheDocument();
	});

	it('returns to typing once it has been closed', async () => {
		await render(LogSheet);
		logUi.show('photo');
		await expect.element(page.getByRole('dialog')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Close' }).click();
		expect(logUi.tab).toBe('type');
	});

	it('will not parse an empty sentence', async () => {
		await openSheet();
		await expect.element(page.getByRole('button', { name: 'Parse' })).toBeDisabled();
	});

	it('proposes items parsed from a sentence', async () => {
		await openSheet();
		await page.getByLabelText('What you ate').fill('two eggs');
		await page.getByRole('button', { name: 'Parse' }).click();
		await expect.element(page.getByText(/Parsed on-device/)).toBeInTheDocument();
	});

	it('says plainly that photo parsing needs a server that does not exist yet', async () => {
		await openSheet();
		await page.getByRole('button', { name: 'Photo' }).click();
		await expect
			.element(page.getByText(/needs the server, which isn’t built yet/))
			.toBeInTheDocument();
	});

	it('opens the camera straight away on the photo tab', async () => {
		const stream = fakeStream();
		Object.defineProperty(navigator, 'mediaDevices', {
			configurable: true,
			value: { getUserMedia: vi.fn(() => Promise.resolve(stream)) }
		});
		await openSheet();
		await page.getByRole('button', { name: 'Photo' }).click();
		await expect.element(page.getByLabelText('Camera viewfinder')).toBeInTheDocument();
	});

	it('keeps the gallery as its own way in, beside the camera', async () => {
		await openSheet();
		await page.getByRole('button', { name: 'Upload' }).click();
		await expect
			.element(page.getByRole('button', { name: 'Choose a picture' }))
			.toBeInTheDocument();
	});

	it('sends the user back to typing from the photo tab', async () => {
		await openSheet();
		await page.getByRole('button', { name: 'Photo' }).click();
		await page.getByRole('button', { name: 'Type it instead' }).click();
		await expect
			.element(page.getByPlaceholder('two eggs, toast, black coffee'))
			.toBeInTheDocument();
	});

	it('offers dictation on the voice tab', async () => {
		await openSheet();
		await page.getByRole('button', { name: 'Voice' }).click();
		await expect.element(page.getByRole('button', { name: 'Start listening' })).toBeInTheDocument();
	});

	it('proposes the catalog match for a scanned barcode', async () => {
		await openSheet();
		await page.getByRole('button', { name: 'Scan' }).click();
		await page.getByRole('button', { name: 'Demo scan' }).click();
		await expect
			.element(page.getByText(FOOD_BY_BARCODE[DEMO_BARCODE]?.name ?? '').first())
			.toBeInTheDocument();
	});

	it('offers the catalog on the search tab', async () => {
		await openSheet();
		await page.getByRole('button', { name: 'Search' }).click();
		await expect
			.element(page.getByPlaceholder('Search foods, brands, barcodes'))
			.toBeInTheDocument();
	});

	it('proposes a food chosen from search', async () => {
		await openSheet();
		await page.getByRole('button', { name: 'Search' }).click();
		await page.getByLabelText('Search foods, brands, barcodes').fill('chicken breast');
		await page.getByRole('button').filter({ hasText: 'kcal' }).first().click();
		await expect.element(page.getByText(/Parsed on-device/)).toBeInTheDocument();
	});

	it('lets the meal be changed', async () => {
		await openSheet();
		await page.getByRole('button', { name: 'dinner' }).click();
		await expect
			.element(page.getByRole('button', { name: 'dinner' }))
			.toHaveAttribute('aria-pressed', 'true');
	});

	it('selects a meal chip in the same tone as every other selected pill', async () => {
		// Regression: this chip used tone="inverse" (black) while every other
		// selected pill in the app (Metric, household member, Search tab) uses the
		// default dark-green primary tone.
		await openSheet();
		await page.getByRole('button', { name: 'dinner' }).click();
		const chip = page.getByRole('button', { name: 'dinner' });
		await expect.element(chip).toHaveClass(/bg-primary/);
		await expect.element(chip).not.toHaveClass(/bg-foreground/);
	});

	it('commits proposals to the log', async () => {
		const add = vi.spyOn(tend, 'addLogItems').mockImplementation(() => undefined);
		await openSheet();
		await page.getByLabelText('What you ate').fill('two eggs');
		await page.getByRole('button', { name: 'Parse' }).click();
		await page.getByRole('button', { name: 'Add to today' }).click();
		expect(add).toHaveBeenCalled();
	});

	it('closes after committing', async () => {
		vi.spyOn(tend, 'addLogItems').mockImplementation(() => undefined);
		await openSheet();
		await page.getByLabelText('What you ate').fill('two eggs');
		await page.getByRole('button', { name: 'Parse' }).click();
		await page.getByRole('button', { name: 'Add to today' }).click();
		expect(logUi.open).toBe(false);
	});

	it('refuses to log a proposal with no catalog food behind it', async () => {
		const add = vi.spyOn(tend, 'addLogItems').mockImplementation(() => undefined);
		await openSheet();
		await page.getByLabelText('What you ate').fill('xyzzy nonexistent gruel');
		await page.getByRole('button', { name: 'Parse' }).click();
		await page.getByRole('button', { name: 'Add to today' }).click();
		expect(add).not.toHaveBeenCalled();
	});

	it('drops a proposal when it is removed', async () => {
		await openSheet();
		await page.getByLabelText('What you ate').fill('two eggs');
		await page.getByRole('button', { name: 'Parse' }).click();
		await page
			.getByRole('button', { name: /^Remove/ })
			.first()
			.click();
		expect(document.body.textContent).not.toContain('Parsed on-device');
	});

	it('closes from the close control', async () => {
		await openSheet();
		await page.getByRole('button', { name: 'Close' }).click();
		expect(logUi.open).toBe(false);
	});

	it('matches a proposal to a catalog food', async () => {
		await openSheet();
		await page.getByLabelText('What you ate').fill('xyzzy nonexistent gruel');
		await page.getByRole('button', { name: 'Parse' }).click();
		await page.getByRole('button', { name: 'Match to catalog' }).click();
		await page.getByLabelText('Find a catalog match').fill('chicken breast');
		await page.getByRole('button').filter({ hasText: 'kcal' }).first().click();
		expect(document.body.textContent).not.toContain('Match to catalog');
	});

	it('adjusts a proposal’s servings before committing', async () => {
		const add = vi.spyOn(tend, 'addLogItems').mockImplementation(() => undefined);
		await openSheet();
		await page.getByLabelText('What you ate').fill('two eggs');
		await page.getByRole('button', { name: 'Parse' }).click();
		await page.getByRole('button', { name: 'Increase' }).click();
		await page.getByRole('button', { name: 'Add to today' }).click();
		expect(add).toHaveBeenCalledWith([expect.objectContaining({ servings: 2.5 })]);
	});

	it('commits every matched item in one go', async () => {
		const add = vi.spyOn(tend, 'addLogItems').mockImplementation(() => undefined);
		await openSheet();
		await page.getByLabelText('What you ate').fill('two eggs, one banana');
		await page.getByRole('button', { name: 'Parse' }).click();
		await page.getByRole('button', { name: 'Add to today' }).click();
		expect(add.mock.calls[0]?.[0]).toHaveLength(2);
	});

	it('puts the catalog search away when the match panel is closed again', async () => {
		await openSheet();
		await page.getByLabelText('What you ate').fill('xyzzy nonexistent gruel');
		await page.getByRole('button', { name: 'Parse' }).click();
		await page.getByRole('button', { name: 'Match to catalog' }).click();
		await expect.element(page.getByLabelText('Find a catalog match')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Match to catalog' }).click();
		expect(document.body.textContent).not.toContain('Find a catalog match');
	});

	it('says so when the browser cannot dictate', async () => {
		const globals = globalThis as unknown as {
			SpeechRecognition?: unknown;
			webkitSpeechRecognition?: unknown;
		};
		const native = globals.webkitSpeechRecognition;
		delete globals.SpeechRecognition;
		delete globals.webkitSpeechRecognition;
		try {
			await openSheet();
			await page.getByRole('button', { name: 'Voice' }).click();
			await page.getByRole('button', { name: 'Start listening' }).click();
			await expect
				.element(page.getByRole('button', { name: 'Start listening' }))
				.toBeInTheDocument();
		} finally {
			globals.webkitSpeechRecognition = native;
		}
	});

	it('listens, then stops when asked again', async () => {
		const globals = globalThis as unknown as { SpeechRecognition?: unknown };
		const stop = vi.fn();
		globals.SpeechRecognition = function Recognition() {
			return {
				lang: '',
				interimResults: true,
				start: vi.fn(),
				stop,
				onresult: null,
				onerror: null,
				onend: null
			};
		};
		try {
			await openSheet();
			await page.getByRole('button', { name: 'Voice' }).click();
			await page.getByRole('button', { name: 'Start listening' }).click();
			await page.getByRole('button', { name: 'Listening — tap to stop' }).click();
			expect(stop).toHaveBeenCalled();
		} finally {
			delete globals.SpeechRecognition;
		}
	});

	it('parses what was heard', async () => {
		const globals = globalThis as unknown as { SpeechRecognition?: unknown };
		let instance: { onresult?: ((ev: unknown) => void) | null } = {};
		globals.SpeechRecognition = function Recognition() {
			instance = {
				lang: '',
				interimResults: true,
				start: vi.fn(),
				stop: vi.fn(),
				onresult: null,
				onerror: null,
				onend: null
			} as never;
			return instance;
		};
		try {
			await openSheet();
			await page.getByRole('button', { name: 'Voice' }).click();
			await page.getByRole('button', { name: 'Start listening' }).click();
			instance.onresult?.({ results: { 0: { 0: { transcript: 'two eggs' } } } });
			await expect.element(page.getByText(/Parsed on-device/)).toBeInTheDocument();
		} finally {
			delete globals.SpeechRecognition;
		}
	});

	it('says so when it did not catch anything', async () => {
		const globals = globalThis as unknown as { SpeechRecognition?: unknown };
		let instance: { onerror?: (() => void) | null } = {};
		globals.SpeechRecognition = function Recognition() {
			instance = {
				lang: '',
				interimResults: true,
				start: vi.fn(),
				stop: vi.fn(),
				onresult: null,
				onerror: null,
				onend: null
			} as never;
			return instance;
		};
		try {
			await openSheet();
			await page.getByRole('button', { name: 'Voice' }).click();
			await page.getByRole('button', { name: 'Start listening' }).click();
			instance.onerror?.();
			await expect
				.element(page.getByRole('button', { name: 'Start listening' }))
				.toBeInTheDocument();
		} finally {
			delete globals.SpeechRecognition;
		}
	});
});

describe('LogSheet on GLP-1', () => {
	it('steps servings in quarters', async () => {
		tend.resetAll();
		tend.completeOnboarding({
			profile: { ...emptyProfile({ name: 'Alex' }), glp1: true, goal: 'glp1' },
			household: false,
			useSample: false
		});
		const add = vi.spyOn(tend, 'addLogItems').mockImplementation(() => undefined);
		await openSheet();
		await page.getByLabelText('What you ate').fill('two eggs');
		await page.getByRole('button', { name: 'Parse' }).click();
		await page.getByRole('button', { name: 'Increase' }).click();
		await page.getByRole('button', { name: 'Add to today' }).click();
		expect(add).toHaveBeenCalledWith([expect.objectContaining({ servings: 2.25 })]);
	});
});
