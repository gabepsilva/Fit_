import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { emptyProfile } from '$lib/domain/profile';
import { FOOD_BY_BARCODE } from '$lib/domain/foods';
import { logUi } from '$lib/state/log-ui.svelte';
import { tend } from '$lib/state/tend.svelte';
import LogSheet from './LogSheet.svelte';

const DEMO_BARCODE = '602652171032';
const OFF_SHELF = '00016000275287';

/** One catalog row in the shape `/api/foods/barcode` sends it. */
const CEREAL = {
	id: 4213,
	name: 'HONEY NUT CHEERIOS',
	brand: 'GENERAL MILLS',
	kind: 'branded',
	category: 'Breakfast Cereals',
	barcode: '00016000275287',
	license: 'PDDL-1.0',
	serving: { label: '3/4 cup', grams: 37 },
	per100g: {
		kcal: 375,
		protein: 8.1,
		fat: 4.5,
		carbs: 78.4,
		sugar: 24.3,
		fiber: 8.1,
		sodium: 500,
		saturatedFat: 0.7
	}
};

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

	it('proposes the bundled food a typed barcode names', async () => {
		await openSheet();
		await page.getByRole('button', { name: 'Scan' }).click();
		await page.getByLabelText('Barcode digits').fill(DEMO_BARCODE);
		await page.getByRole('button', { name: 'Look it up' }).click();
		await expect
			.element(page.getByText(FOOD_BY_BARCODE[DEMO_BARCODE]?.name ?? '').first())
			.toBeInTheDocument();
	});

	it('no longer offers a hard-coded demo scan', async () => {
		await openSheet();
		await page.getByRole('button', { name: 'Scan' }).click();
		await expect.element(page.getByLabelText('Barcode digits')).toBeInTheDocument();
		expect(document.body.textContent).not.toContain('Demo scan');
	});

	it('logs a scanned food the server catalog knows and the bundled foods do not', async () => {
		const add = vi.spyOn(tend, 'addLogItems').mockImplementation(() => undefined);
		vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
			Promise.resolve(
				new Response(JSON.stringify({ barcode: OFF_SHELF, ambiguous: false, foods: [CEREAL] }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
			)
		);
		await openSheet();
		await page.getByRole('button', { name: 'Scan' }).click();
		await page.getByLabelText('Barcode digits').fill(OFF_SHELF);
		await page.getByRole('button', { name: 'Look it up' }).click();
		await expect.element(page.getByText('HONEY NUT CHEERIOS').first()).toBeInTheDocument();
		await page.getByRole('button', { name: 'Add to today' }).click();
		expect(add).toHaveBeenCalledOnce();
		// The catalog's own id is not stored: the entry carries its own macros.
		expect(add.mock.calls[0]?.[0]?.[0]).toMatchObject({
			foodId: null,
			name: 'HONEY NUT CHEERIOS',
			kcal: 139
		});
	});

	it('offers the catalog on the search tab', async () => {
		await openSheet();
		await page.getByRole('button', { name: 'Search' }).click();
		await expect
			.element(page.getByPlaceholder('Search foods, brands, barcodes'))
			.toBeInTheDocument();
	});

	it('logs a food search found only in the server catalog', async () => {
		// Regression: search handed a catalog food straight to `propose`, which
		// stores its id and nothing else. `commit` then found no bundled food
		// behind that id and dropped the item, so nothing past the bundled 96
		// could be logged at all, and the sheet said only "match it first".
		const add = vi.spyOn(tend, 'addLogItems').mockImplementation(() => undefined);
		vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
			Promise.resolve(
				new Response(JSON.stringify({ foods: [CEREAL] }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
			)
		);
		await openSheet();
		await page.getByRole('button', { name: 'Search' }).click();
		await page.getByLabelText('Search foods, brands, barcodes').fill('kumquat');
		const hit = page.getByRole('button', { name: /HONEY NUT CHEERIOS/ });
		await expect.element(hit, { timeout: 4000 }).toBeInTheDocument();
		await hit.click();
		await page.getByRole('button', { name: 'Add to today' }).click();
		expect(add).toHaveBeenCalledOnce();
		expect(add.mock.calls[0]?.[0]?.[0]).toMatchObject({
			foodId: null,
			name: 'HONEY NUT CHEERIOS',
			kcal: 139
		});
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

	it('logs the calories in the volume that was typed, not in one serving', async () => {
		// Olive oil is served by the tablespoon: 14 g, 119 kcal. Two tablespoons is
		// two servings, and logging one of them would be half the calories eaten.
		const add = vi.spyOn(tend, 'addLogItems').mockImplementation(() => undefined);
		await openSheet();
		await page.getByLabelText('What you ate').fill('2 tbsp olive oil');
		await page.getByRole('button', { name: 'Parse' }).click();
		await page.getByRole('button', { name: 'Add to today' }).click();
		const [logged] = add.mock.calls[0] ?? [];
		expect(logged?.[0]).toMatchObject({ name: 'Olive oil', servings: 2, kcal: 238 });
	});

	it('says how many millilitres the food’s serving is', async () => {
		await openSheet();
		await page.getByLabelText('What you ate').fill('2 tbsp olive oil');
		await page.getByRole('button', { name: 'Parse' }).click();
		await expect.element(page.getByText('1 tbsp (15 ml)')).toBeInTheDocument();
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

	it('does not remount a proposal row when its own stepper is tapped', async () => {
		// Regression: keying the list by object identity would remount the very
		// row whose stepper was tapped, since `onchange` emits a fresh object for
		// that proposal. Keying by a stable id must leave the DOM node in place.
		await openSheet();
		await page.getByLabelText('What you ate').fill('two eggs');
		await page.getByRole('button', { name: 'Parse' }).click();
		await expect.element(page.getByText(/Parsed on-device/)).toBeInTheDocument();
		const row = document.querySelector('li');
		await page.getByRole('button', { name: 'Increase' }).click();
		expect(document.querySelector('li')).toBe(row);
	});

	it('keeps the match panel on the same proposal when an earlier one is removed', async () => {
		// Regression #112: the panel was tracked by index. Removing an earlier
		// proposal shifted every later index, moving the open panel onto
		// whatever proposal now sits at that position instead of following the
		// proposal it was actually opened for.
		await openSheet();
		await page
			.getByLabelText('What you ate')
			.fill('two eggs, one banana, xyzzy nonexistent gruel, chicken breast');
		await page.getByRole('button', { name: 'Parse' }).click();
		await page.getByRole('button', { name: 'Match to catalog' }).click();
		await expect.element(page.getByLabelText('Find a catalog match')).toBeInTheDocument();

		await page
			.getByRole('button', { name: /^Remove/ })
			.first()
			.click();

		const panelRow = Array.from(document.querySelectorAll('li')).find((li) =>
			li.querySelector('input[placeholder="Find a catalog match"]')
		);
		expect(panelRow?.textContent).toContain('gruel');
		expect(panelRow?.textContent).not.toContain('chicken breast');
	});

	it('closes the match panel when the proposal it belongs to is removed', async () => {
		await openSheet();
		await page.getByLabelText('What you ate').fill('two eggs, xyzzy nonexistent gruel');
		await page.getByRole('button', { name: 'Parse' }).click();
		await page.getByRole('button', { name: 'Match to catalog' }).click();
		await expect.element(page.getByLabelText('Find a catalog match')).toBeInTheDocument();

		await page
			.getByRole('button', { name: /^Remove/ })
			.nth(1)
			.click();

		expect(document.body.textContent).not.toContain('Find a catalog match');
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
