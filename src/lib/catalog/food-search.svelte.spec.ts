import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogFoodPayload } from '$lib/domain/catalog-food';
import {
	createFoodSearch,
	DEBOUNCE_MS,
	MIN_QUERY_LENGTH,
	searchCatalogFoods
} from './food-search.svelte';

function row(id: number, name: string): CatalogFoodPayload {
	return {
		id,
		name,
		brand: null,
		kind: 'generic',
		category: 'Poultry',
		barcode: null,
		license: 'PDDL-1.0',
		serving: { label: '100 g', grams: 100 },
		per100g: {
			kcal: 165,
			protein: 31,
			fat: 3.6,
			carbs: 0,
			sugar: 0,
			fiber: 0,
			sodium: 74,
			saturatedFat: 1
		}
	};
}

const BREAST = row(1, 'Chicken, breast, roasted');
const THIGH = row(2, 'Chicken, thigh, roasted');

function answering(status: number, body?: unknown) {
	return vi.fn<(input: RequestInfo | URL) => Promise<Response>>(() =>
		Promise.resolve(
			new Response(body === undefined ? null : JSON.stringify(body), {
				status,
				headers: { 'content-type': 'application/json' }
			})
		)
	);
}

/** A response this test resolves by hand, so two requests can be finished out of order. */
function held() {
	let settle: (response: Response) => void = () => undefined;
	const promise = new Promise<Response>((resolve) => (settle = resolve));
	return {
		promise,
		answer: (foods: CatalogFoodPayload[]) =>
			settle(
				new Response(JSON.stringify({ foods }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
			)
	};
}

describe('searchCatalogFoods', () => {
	it('asks the catalog endpoint for what was typed', async () => {
		const fetching = answering(200, { foods: [BREAST] });
		const outcome = await searchCatalogFoods('chicken breast', fetching);
		expect(fetching.mock.calls[0]?.[0]).toBe('/api/foods?q=chicken%20breast');
		expect(outcome).toMatchObject({ kind: 'matched' });
		expect(outcome.kind === 'matched' && outcome.foods[0]?.name).toBe('Chicken, breast, roasted');
	});

	it('scales a catalog row onto its serving before handing it over', async () => {
		const outcome = await searchCatalogFoods(
			'chicken',
			answering(200, { foods: [{ ...BREAST, serving: { label: 'half breast', grams: 50 } }] })
		);
		expect(outcome.kind === 'matched' && outcome.foods[0]).toMatchObject({
			kcal: 83,
			protein: 15.5,
			servingLabel: 'half breast'
		});
	});

	it('reads an empty match list as no results rather than as a failure', async () => {
		expect(await searchCatalogFoods('qqqzzz', answering(200, { foods: [] }))).toEqual({
			kind: 'none'
		});
	});

	it('reads a 401 as signed out, which is something the person can undo', async () => {
		expect(await searchCatalogFoods('chicken', answering(401))).toEqual({ kind: 'signed-out' });
	});

	it('reads a missing catalog as out of reach rather than as no such food', async () => {
		expect(await searchCatalogFoods('chicken', answering(503))).toEqual({ kind: 'unreachable' });
	});

	it('refuses a body carried by a status that is not ok, however readable it looks', async () => {
		// A proxy or an error page can answer 500 with perfectly shaped JSON.
		// Reading the rows off it would present someone else's body as catalog
		// matches; the status is what says whether there was an answer at all.
		expect(await searchCatalogFoods('chicken', answering(500, { foods: [BREAST] }))).toEqual({
			kind: 'unreachable'
		});
	});

	it('reads a dropped connection as out of reach', async () => {
		const outcome = await searchCatalogFoods(
			'chicken',
			vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
		);
		expect(outcome).toEqual({ kind: 'unreachable' });
	});

	it('reads a body it cannot parse as out of reach, not as no results', async () => {
		const outcome = await searchCatalogFoods(
			'chicken',
			vi.fn(() => Promise.resolve(new Response('<html>proxy error</html>', { status: 200 })))
		);
		expect(outcome).toEqual({ kind: 'unreachable' });
	});

	it('reads a JSON body with no foods in it as out of reach', async () => {
		expect(await searchCatalogFoods('chicken', answering(200, { query: 'chicken' }))).toEqual({
			kind: 'unreachable'
		});
	});

	it('reads a JSON body of null as out of reach', async () => {
		expect(await searchCatalogFoods('chicken', answering(200, null))).toEqual({
			kind: 'unreachable'
		});
	});

	it('refuses the whole answer when one row is unreadable, rather than dropping it', async () => {
		// `some` instead of `every` here would silently offer a shorter list than
		// the catalog returned, with nothing said about what was thrown away.
		const outcome = await searchCatalogFoods(
			'chicken',
			answering(200, { foods: [BREAST, { name: 'Chicken, thigh' }] })
		);
		expect(outcome).toEqual({ kind: 'unreachable' });
	});
});

describe('createFoodSearch', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('is not searching before anything has been typed', () => {
		const search = createFoodSearch(answering(200, { foods: [BREAST] }));
		expect(search.searching).toBe(false);
		expect(search.outcome).toBeNull();
	});

	it('searches on exactly three characters, which is where the server starts', async () => {
		const fetching = answering(200, { foods: [BREAST] });
		const search = createFoodSearch(fetching);
		search.ask('egg');
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
		expect(fetching).toHaveBeenCalledOnce();
		expect(fetching.mock.calls[0]?.[0]).toBe('/api/foods?q=egg');
	});

	it('sends what was typed without the spaces around it', async () => {
		const fetching = answering(200, { foods: [BREAST] });
		const search = createFoodSearch(fetching);
		search.ask('  chicken  ');
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
		expect(fetching.mock.calls[0]?.[0]).toBe('/api/foods?q=chicken');
	});

	it('sends nothing until the typing pauses', async () => {
		const fetching = answering(200, { foods: [BREAST] });
		const search = createFoodSearch(fetching);
		search.ask('chi');
		search.ask('chic');
		search.ask('chicken');
		expect(fetching).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
		expect(fetching).toHaveBeenCalledOnce();
		expect(fetching.mock.calls[0]?.[0]).toBe('/api/foods?q=chicken');
	});

	it('does not send a query shorter than the catalog will search', async () => {
		const fetching = answering(200, { foods: [BREAST] });
		const search = createFoodSearch(fetching);
		search.ask('ch');
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
		expect(fetching).not.toHaveBeenCalled();
		expect(search.outcome).toBeNull();
		expect(MIN_QUERY_LENGTH).toBe(3);
	});

	it('says it is searching from the keystroke until the answer lands', async () => {
		const search = createFoodSearch(answering(200, { foods: [BREAST] }));
		search.ask('chicken');
		expect(search.searching).toBe(true);
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
		expect(search.searching).toBe(false);
	});

	it('drops a query that becomes too short, so no stale answer can land', async () => {
		const first = held();
		const fetching = vi.fn(() => first.promise);
		const search = createFoodSearch(fetching);
		search.ask('chicken');
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
		search.ask('ch');
		expect(search.searching).toBe(false);
		first.answer([BREAST]);
		await vi.advanceTimersByTimeAsync(0);
		expect(search.outcome).toBeNull();
	});

	it('keeps the later answer when an earlier query finishes after it', async () => {
		// The race is real: "chicken" scores far more rows than "chicken thigh",
		// so the first request can land second and overwrite what was asked for.
		const slow = held();
		const fast = held();
		const fetching = vi
			.fn<(input: RequestInfo | URL) => Promise<Response>>()
			.mockReturnValueOnce(slow.promise)
			.mockReturnValueOnce(fast.promise);
		const search = createFoodSearch(fetching);

		search.ask('chicken');
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
		search.ask('chicken thigh');
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
		expect(fetching).toHaveBeenCalledTimes(2);

		fast.answer([THIGH]);
		await vi.advanceTimersByTimeAsync(0);
		expect(search.outcome).toMatchObject({ kind: 'matched' });
		expect(search.outcome?.kind === 'matched' && search.outcome.foods[0]?.name).toBe(
			'Chicken, thigh, roasted'
		);

		slow.answer([BREAST]);
		await vi.advanceTimersByTimeAsync(0);
		expect(search.outcome?.kind === 'matched' && search.outcome.foods[0]?.name).toBe(
			'Chicken, thigh, roasted'
		);
		expect(search.searching).toBe(false);
	});

	it('throws away an answer a newer query has already replaced', async () => {
		const first = held();
		const second = held();
		const fetching = vi
			.fn<(input: RequestInfo | URL) => Promise<Response>>()
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise);
		const search = createFoodSearch(fetching);
		search.ask('chicken');
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
		search.ask('chicken thigh');
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
		first.answer([BREAST]);
		await vi.advanceTimersByTimeAsync(0);
		// The first answer is stale the moment the second query went out.
		expect(search.outcome).toBeNull();
		expect(search.searching).toBe(true);
	});

	it('cancels a pending request when the search box goes away', async () => {
		const fetching = answering(200, { foods: [BREAST] });
		const search = createFoodSearch(fetching);
		search.ask('chicken');
		search.stop();
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
		expect(fetching).not.toHaveBeenCalled();
	});
});
