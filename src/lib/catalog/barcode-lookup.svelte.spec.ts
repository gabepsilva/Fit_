import { describe, expect, it, vi } from 'vitest';
import type { CatalogFoodPayload } from '$lib/domain/catalog-food';
import { FOOD_BY_BARCODE } from '$lib/domain/foods';
import { lookupBarcode } from './barcode-lookup';

/** A barcode the bundled foods carry, and one they do not. */
const BUNDLED = '602652171032';
const OFF_SHELF = '00016000275287';

const CEREAL: CatalogFoodPayload = {
	id: 4213,
	name: 'HONEY NUT CHEERIOS',
	brand: 'GENERAL MILLS',
	kind: 'branded',
	category: 'Breakfast Cereals',
	barcode: OFF_SHELF,
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

describe('lookupBarcode', () => {
	it('answers from the bundled foods without asking the server', async () => {
		const fetching = answering(500);
		const outcome = await lookupBarcode(BUNDLED, fetching);
		expect(outcome).toEqual({
			kind: 'known',
			code: BUNDLED,
			ambiguous: false,
			foods: [FOOD_BY_BARCODE[BUNDLED]]
		});
		expect(fetching).not.toHaveBeenCalled();
	});

	it('normalizes what was typed before matching a bundled food', async () => {
		const outcome = await lookupBarcode(' 6026 5217 1032 ', answering(500));
		expect(outcome).toMatchObject({ kind: 'known', code: BUNDLED });
	});

	it('asks the catalog endpoint for a barcode the bundled foods do not carry', async () => {
		const fetching = answering(200, { barcode: OFF_SHELF, ambiguous: false, foods: [CEREAL] });
		const outcome = await lookupBarcode(OFF_SHELF, fetching);
		expect(fetching.mock.calls[0]?.[0]).toBe(`/api/foods/barcode?code=${OFF_SHELF}`);
		expect(outcome).toMatchObject({ kind: 'known', code: OFF_SHELF, ambiguous: false });
		expect(outcome.kind === 'known' && outcome.foods[0]?.name).toBe('HONEY NUT CHEERIOS');
	});

	it('hands back every food a duplicated barcode names, and says it is ambiguous', async () => {
		const outcome = await lookupBarcode(
			OFF_SHELF,
			answering(200, {
				barcode: OFF_SHELF,
				ambiguous: true,
				foods: [CEREAL, { ...CEREAL, id: 9001, name: 'HONEY NUT CHEERIOS, FAMILY SIZE' }]
			})
		);
		expect(outcome).toMatchObject({ kind: 'known', ambiguous: true });
		expect(outcome.kind === 'known' && outcome.foods).toHaveLength(2);
	});

	it('reads a 404 as a barcode the catalog does not know', async () => {
		expect(await lookupBarcode(OFF_SHELF, answering(404))).toEqual({
			kind: 'unknown',
			code: OFF_SHELF
		});
	});

	it('reads a 401 as signed out, which is something the person can undo', async () => {
		expect(await lookupBarcode(OFF_SHELF, answering(401))).toEqual({
			kind: 'signed-out',
			code: OFF_SHELF
		});
	});

	it('reads a missing catalog as out of reach rather than as no such food', async () => {
		expect(await lookupBarcode(OFF_SHELF, answering(503))).toEqual({
			kind: 'unreachable',
			code: OFF_SHELF
		});
	});

	it('reads a dropped connection as out of reach', async () => {
		const outcome = await lookupBarcode(
			OFF_SHELF,
			vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
		);
		expect(outcome).toEqual({ kind: 'unreachable', code: OFF_SHELF });
	});

	it('reads a body it cannot parse as out of reach, not as a match', async () => {
		const outcome = await lookupBarcode(
			OFF_SHELF,
			vi.fn(() => Promise.resolve(new Response('<html>proxy error</html>', { status: 200 })))
		);
		expect(outcome).toEqual({ kind: 'unreachable', code: OFF_SHELF });
	});

	it('reads a JSON body with no foods in it as out of reach', async () => {
		expect(await lookupBarcode(OFF_SHELF, answering(200, { barcode: OFF_SHELF }))).toEqual({
			kind: 'unreachable',
			code: OFF_SHELF
		});
	});

	it('reads a JSON body of null as out of reach', async () => {
		expect(await lookupBarcode(OFF_SHELF, answering(200, null))).toEqual({
			kind: 'unreachable',
			code: OFF_SHELF
		});
	});

	it('refuses the whole answer when one of its rows is unreadable, rather than dropping it', async () => {
		// `some` instead of `every` here would offer one food where the barcode
		// named two, and say nothing about the one it threw away.
		const outcome = await lookupBarcode(
			OFF_SHELF,
			answering(200, {
				barcode: OFF_SHELF,
				ambiguous: true,
				foods: [CEREAL, { name: 'HONEY NUT CHEERIOS, FAMILY SIZE' }]
			})
		);
		expect(outcome).toEqual({ kind: 'unreachable', code: OFF_SHELF });
	});

	it('refuses a row whose shape it does not recognize rather than logging a blank food', async () => {
		const outcome = await lookupBarcode(
			OFF_SHELF,
			answering(200, { barcode: OFF_SHELF, ambiguous: false, foods: [{ name: 'CHEERIOS' }] })
		);
		expect(outcome).toEqual({ kind: 'unreachable', code: OFF_SHELF });
	});

	it('reads an empty match list as unknown rather than as a match with nothing in it', async () => {
		const outcome = await lookupBarcode(
			OFF_SHELF,
			answering(200, { barcode: OFF_SHELF, ambiguous: false, foods: [] })
		);
		expect(outcome).toEqual({ kind: 'unknown', code: OFF_SHELF });
	});

	it('reads the server rejecting the code as invalid input', async () => {
		expect(await lookupBarcode(OFF_SHELF, answering(400))).toEqual({ kind: 'invalid' });
	});

	it('does not send something that is not a barcode', async () => {
		const fetching = answering(200);
		expect(await lookupBarcode('cheerios', fetching)).toEqual({ kind: 'invalid' });
		expect(fetching).not.toHaveBeenCalled();
	});
});
