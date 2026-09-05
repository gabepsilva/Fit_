import { describe, expect, it, vi } from 'vitest';
import type { CatalogFoodPayload } from '$lib/domain/catalog-food';
import { MAX_QUERIES, resolveFoodNames } from './food-resolve';

const CEREAL: CatalogFoodPayload = {
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

function answering(status: number, body?: unknown) {
	return vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(() =>
		Promise.resolve(
			new Response(body === undefined ? null : JSON.stringify(body), {
				status,
				headers: { 'content-type': 'application/json' }
			})
		)
	);
}

function refusing() {
	return vi.fn<(input: RequestInfo | URL) => Promise<Response>>(() =>
		Promise.reject(new Error('offline'))
	);
}

describe('resolveFoodNames', () => {
	it('asks the resolve endpoint once, with every name in the body', async () => {
		const fetching = answering(200, {
			items: [
				{ query: 'eggs', food: null, alternatives: [] },
				{ query: 'toast', food: null, alternatives: [] }
			]
		});
		await resolveFoodNames(['eggs', 'toast'], fetching);
		expect(fetching).toHaveBeenCalledOnce();
		const [target, init] = fetching.mock.calls[0] ?? [];
		expect(typeof target === 'string' ? target : '').toContain('/api/foods/resolve');
		expect(init?.method).toBe('POST');
		expect(init?.body).toBe(JSON.stringify({ queries: ['eggs', 'toast'] }));
	});

	it('turns a catalog row into a food scaled onto its serving', async () => {
		const fetching = answering(200, {
			items: [{ query: 'cheerios', food: CEREAL, alternatives: [] }]
		});
		const outcome = await resolveFoodNames(['cheerios'], fetching);
		expect(outcome.kind).toBe('resolved');
		if (outcome.kind !== 'resolved') return;
		expect(outcome.items[0]?.query).toBe('cheerios');
		expect(outcome.items[0]?.food?.name).toBe('HONEY NUT CHEERIOS');
		// 375 kcal per 100 g over a 37 g serving.
		expect(outcome.items[0]?.food?.kcal).toBe(139);
	});

	it('keeps a name the catalog had nothing for, rather than dropping the row', async () => {
		const fetching = answering(200, {
			items: [
				{ query: 'cheerios', food: CEREAL, alternatives: [] },
				{ query: 'xyzzy gruel', food: null, alternatives: [] }
			]
		});
		const outcome = await resolveFoodNames(['cheerios', 'xyzzy gruel'], fetching);
		if (outcome.kind !== 'resolved') throw new Error(`expected rows, got ${outcome.kind}`);
		expect(outcome.items.map((item) => item.food?.name ?? null)).toEqual([
			'HONEY NUT CHEERIOS',
			null
		]);
	});

	it('reads a missing `food` field as no food, the same as an explicit null', async () => {
		const fetching = answering(200, { items: [{ query: 'eggs', alternatives: [] }] });
		const outcome = await resolveFoodNames(['eggs'], fetching);
		expect(outcome).toEqual({ kind: 'resolved', items: [{ query: 'eggs', food: null }] });
	});

	it('says the device is signed out rather than that nothing matched', async () => {
		expect(await resolveFoodNames(['eggs'], answering(401))).toEqual({ kind: 'signed-out' });
	});

	it('reads a server with no catalog as unreachable, not as an empty answer', async () => {
		expect(await resolveFoodNames(['eggs'], answering(503))).toEqual({ kind: 'unreachable' });
	});

	it('reads a refused body as unreachable', async () => {
		expect(await resolveFoodNames(['eggs'], answering(400))).toEqual({ kind: 'unreachable' });
	});

	it('reads a dropped connection as unreachable', async () => {
		expect(await resolveFoodNames(['eggs'], refusing())).toEqual({ kind: 'unreachable' });
	});

	it('reads a body that is not JSON as unreachable', async () => {
		const fetching = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(() =>
			Promise.resolve(new Response('not json', { status: 200 }))
		);
		expect(await resolveFoodNames(['eggs'], fetching)).toEqual({ kind: 'unreachable' });
	});

	it('reads a 200 that carries no items as unreachable', async () => {
		expect(await resolveFoodNames(['eggs'], answering(200, { items: 'nope' }))).toEqual({
			kind: 'unreachable'
		});
	});

	it('refuses an answer of the wrong length, which could not be lined up', async () => {
		const fetching = answering(200, { items: [{ query: 'eggs', food: null }] });
		expect(await resolveFoodNames(['eggs', 'toast'], fetching)).toEqual({ kind: 'unreachable' });
	});

	it('refuses the whole answer when one row cannot be read', async () => {
		// Taking the unreadable row as "nothing matched" would tell the person
		// their food is not in the catalog when it is.
		const fetching = answering(200, {
			items: [
				{ query: 'cheerios', food: CEREAL },
				{ query: 'eggs', food: { ...CEREAL, per100g: { ...CEREAL.per100g, kcal: 'lots' } } }
			]
		});
		expect(await resolveFoodNames(['cheerios', 'eggs'], fetching)).toEqual({
			kind: 'unreachable'
		});
	});

	it('refuses a row that does not even name what was asked', async () => {
		const fetching = answering(200, { items: [{ food: null }] });
		expect(await resolveFoodNames(['eggs'], fetching)).toEqual({ kind: 'unreachable' });
	});

	it('caps at the number of names one request may carry', () => {
		expect(MAX_QUERIES).toBe(12);
	});
});
