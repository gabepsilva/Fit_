import { describe, expect, it, vi } from 'vitest';
import { readPhoto } from './photo-log';

const IMAGE = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

/** One catalog row in the shape `/api/meals/photo` sends it. */
const MILK = {
	id: 3,
	name: 'MILK',
	brand: 'NORTH VALLEY DAIRY',
	kind: 'branded',
	category: 'Dairy',
	barcode: '00000000000035',
	license: 'PDDL-1.0',
	serving: { label: '1 cup', grams: 244 },
	per100g: {
		kcal: 61,
		protein: 3.2,
		fat: 3.3,
		carbs: 4.8,
		sugar: 5.1,
		fiber: 0,
		sodium: 43,
		saturatedFat: 1.9
	}
};

function answering(body: unknown, status = 200) {
	return vi.fn(() =>
		Promise.resolve(new Response(JSON.stringify(body), { status }))
	) as unknown as typeof fetch;
}

function plate(items: unknown) {
	return answering({ items });
}

describe('what it sends', () => {
	it('posts the still and the meal as JSON', async () => {
		const sent = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{"items":[]}')));
		await readPhoto(IMAGE, 'dinner', sent);
		const call = sent.mock.calls[0];
		if (call === undefined) throw new Error('nothing was sent');
		const [url, init] = call as [string, RequestInit];
		expect(url).toContain('/api/meals/photo');
		expect(init.method).toBe('POST');
		expect(new Headers(init.headers).get('content-type')).toBe('application/json');
		const body = init.body;
		if (typeof body !== 'string') throw new Error('the request carried no JSON body');
		expect(JSON.parse(body)).toEqual({ image: IMAGE, meal: 'dinner' });
	});
});

describe('what it makes of the answer', () => {
	it('turns a catalog row into a food already scaled onto its serving', async () => {
		const outcome = await readPhoto(
			IMAGE,
			'lunch',
			plate([{ label: 'a glass of milk', grams: 200, food: MILK, alternatives: [] }])
		);
		expect(outcome).toMatchObject({ kind: 'ok' });
		const foods = outcome.kind === 'ok' ? outcome.foods : [];
		expect(foods[0]?.label).toBe('a glass of milk');
		expect(foods[0]?.grams).toBe(200);
		expect(foods[0]?.food?.name).toBe('MILK');
		// 61 kcal per 100 g across a 244 g serving.
		expect(foods[0]?.food?.kcal).toBe(149);
	});

	it('keeps a food the catalog could not match, so the person sees what was skipped', async () => {
		const outcome = await readPhoto(
			IMAGE,
			'lunch',
			plate([{ label: 'something orange', grams: 40, food: null, alternatives: [] }])
		);
		expect(outcome).toEqual({
			kind: 'ok',
			foods: [{ label: 'something orange', grams: 40, food: null }]
		});
	});

	it('reads a photo with no food in it as an empty plate rather than a failure', async () => {
		expect(await readPhoto(IMAGE, 'lunch', plate([]))).toEqual({ kind: 'ok', foods: [] });
	});

	it('drops a row whose food is present but unreadable, rather than logging nothing for it', async () => {
		const broken = { ...MILK, per100g: { ...MILK.per100g, kcal: 'lots' } };
		const outcome = await readPhoto(
			IMAGE,
			'lunch',
			plate([
				{ label: 'milk', grams: 200, food: MILK, alternatives: [] },
				{ label: 'mystery', grams: 10, food: broken, alternatives: [] }
			])
		);
		expect(outcome.kind === 'ok' && outcome.foods).toHaveLength(1);
	});

	it('drops a row with no label or no weight', async () => {
		const outcome = await readPhoto(IMAGE, 'lunch', plate([{ grams: 10 }, { label: 'egg' }]));
		expect(outcome).toEqual({ kind: 'ok', foods: [] });
	});
});

describe('when there is no plate to read', () => {
	it('says the device is signed out when the endpoint refuses the session', async () => {
		expect(await readPhoto(IMAGE, 'lunch', answering({}, 401))).toEqual({
			kind: 'unauthenticated'
		});
	});

	it('says the allowance is spent when the endpoint throttles it', async () => {
		expect(await readPhoto(IMAGE, 'lunch', answering({}, 429))).toEqual({ kind: 'quota' });
	});

	it('says unavailable for the server that cannot read photos', async () => {
		expect(await readPhoto(IMAGE, 'lunch', answering({}, 503))).toEqual({ kind: 'unavailable' });
	});

	it('says unavailable for a status nothing expected', async () => {
		expect(await readPhoto(IMAGE, 'lunch', answering({}, 500))).toEqual({ kind: 'unavailable' });
	});

	it('says offline when the request never got an answer', async () => {
		const dropped = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
		expect(await readPhoto(IMAGE, 'lunch', dropped as unknown as typeof fetch)).toEqual({
			kind: 'offline'
		});
	});

	it('says unavailable when a 200 carries something that is not JSON', async () => {
		const html = vi.fn(() => Promise.resolve(new Response('<html>oops</html>')));
		expect(await readPhoto(IMAGE, 'lunch', html as unknown as typeof fetch)).toEqual({
			kind: 'unavailable'
		});
	});

	it('says unavailable when the answer carries no items at all', async () => {
		expect(await readPhoto(IMAGE, 'lunch', answering({ foods: [] }))).toEqual({
			kind: 'unavailable'
		});
	});
});
