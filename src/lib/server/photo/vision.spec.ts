import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_VISION_MODEL,
	MAX_PLATE_ITEMS,
	itemsFrom,
	readPlate,
	visionApiKey,
	visionModel,
	VISION_TIMEOUT_MS
} from './vision';

const KEY = 'sk-test-not-a-real-key';
const IMAGE = 'data:image/jpeg;base64,AAAA';

/** The upstream body for a plate, in the shape the live API answered with. */
function completion(items: unknown, usage: Record<string, number> | undefined = undefined) {
	return {
		model: 'gpt-5-nano-2025-08-07',
		choices: [{ message: { content: JSON.stringify({ items }) }, finish_reason: 'stop' }],
		usage: usage ?? { prompt_tokens: 508, completion_tokens: 78, total_tokens: 586 }
	};
}

type SentCall = [url: string, init: RequestInit];

function answering(body: unknown, status = 200) {
	return vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

/** The one call the injected fetch received. */
function firstCall(sent: { mock: { calls: unknown[][] } }): SentCall {
	const call = sent.mock.calls[0];
	if (call === undefined) throw new Error('nothing was sent');
	return call as SentCall;
}

/** The parsed request body of that call. */
function sentBody(sent: { mock: { calls: unknown[][] } }): Record<string, unknown> {
	const body = firstCall(sent)[1].body;
	if (typeof body !== 'string') throw new Error('the request carried no JSON body');
	return JSON.parse(body) as Record<string, unknown>;
}

const PLATE = [{ label: 'fried egg', search_query: 'fried egg', grams: 60 }];

/** A completion body carrying exactly this content, whatever shape it is. */
function saying(content: unknown): Record<string, unknown> {
	return { choices: [{ message: { content } }] };
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('the request it sends', () => {
	it('posts to the completions API with the key as a bearer token', async () => {
		const sent = answering(completion(PLATE));
		await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		const [url, init] = firstCall(sent);
		expect(url).toBe('https://api.openai.com/v1/chat/completions');
		expect(init.method).toBe('POST');
		expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${KEY}`);
	});

	it('names the configured model rather than guessing one', async () => {
		const sent = answering(completion(PLATE));
		await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY, model: 'gpt-4.1-nano' });
		expect(sentBody(sent)['model']).toBe('gpt-4.1-nano');
	});

	it('sends the still at low detail, which is what keeps a call a fraction of a cent', async () => {
		const sent = answering(completion(PLATE));
		await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		const messages = sentBody(sent)['messages'] as { role: string; content: unknown }[];
		const parts = messages[1]?.content as {
			type: string;
			image_url?: { url: string; detail: string };
		}[];
		const image = parts.find((part) => part.type === 'image_url');
		expect(image?.image_url).toEqual({ url: IMAGE, detail: 'low' });
	});

	it('tells the model which meal it is looking at', async () => {
		const sent = answering(completion(PLATE));
		await readPlate(IMAGE, 'breakfast', { fetchImpl: sent, apiKey: KEY });
		const messages = sentBody(sent)['messages'] as { content: unknown }[];
		const parts = messages[1]?.content as { type: string; text?: string }[];
		expect(parts.find((part) => part.type === 'text')?.text).toBe('This is breakfast.');
	});

	it('constrains the answer with a strict JSON schema rather than asking politely', async () => {
		const sent = answering(completion(PLATE));
		await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		const format = sentBody(sent)['response_format'] as {
			type: string;
			json_schema: { strict: boolean; schema: { required: string[] } };
		};
		expect(format.type).toBe('json_schema');
		expect(format.json_schema.strict).toBe(true);
		expect(format.json_schema.schema.required).toEqual(['items']);
	});

	it('caps what the model may spend on one answer', async () => {
		const sent = answering(completion(PLATE));
		await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		expect(sentBody(sent)['max_completion_tokens']).toBe(600);
	});

	it('asks the gpt-5 family for minimal reasoning, which is what makes it answer at all', async () => {
		const sent = answering(completion(PLATE));
		await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY, model: 'gpt-5-nano' });
		expect(sentBody(sent)['reasoning_effort']).toBe('minimal');
	});

	it('sends no reasoning effort to a model that has no such parameter', async () => {
		const sent = answering(completion(PLATE));
		await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY, model: 'gpt-4.1-nano' });
		expect(Object.hasOwn(sentBody(sent), 'reasoning_effort')).toBe(false);
	});

	it('gives up on the call rather than holding a person at the shutter', async () => {
		const sent = answering(completion(PLATE));
		await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY, timeoutMs: 1234 });
		expect(firstCall(sent)[1].signal).toBeInstanceOf(AbortSignal);
	});

	it('waits twenty seconds by default', () => {
		expect(VISION_TIMEOUT_MS).toBe(20_000);
	});

	it('declares the body as JSON', async () => {
		const sent = answering(completion(PLATE));
		await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		expect(new Headers(firstCall(sent)[1].headers).get('content-type')).toBe('application/json');
	});

	it('puts the instructions in a system message and the plate in a user one', async () => {
		const sent = answering(completion(PLATE));
		await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		const messages = sentBody(sent)['messages'] as { role: string; content: unknown }[];
		expect(messages).toHaveLength(2);
		expect(messages[0]?.role).toBe('system');
		expect(messages[1]?.role).toBe('user');
	});

	it('asks for foods, weights, generic search terms and no tableware', async () => {
		const sent = answering(completion(PLATE));
		await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		const messages = sentBody(sent)['messages'] as { content: unknown }[];
		const instructions = String(messages[0]?.content);
		expect(instructions).toContain('Identify the distinct foods and drinks on the plate.');
		expect(instructions).toContain('Estimate each portion in grams.');
		expect(instructions).toContain('singular generic terms');
		expect(instructions).toContain('not brand names');
		expect(instructions).toContain('Skip cutlery, tableware and garnish.');
		expect(instructions).toContain(`At most ${MAX_PLATE_ITEMS} items.`);
		expect(instructions).toContain('Return an empty list when the picture holds no food.');
	});
});

describe('what it makes of the answer', () => {
	it('reads the foods, their search terms and their weights', async () => {
		const sent = answering(
			completion([
				{ label: 'fried egg', search_query: 'fried egg', grams: 60 },
				{ label: 'green peas', search_query: 'green peas', grams: 25 }
			])
		);
		const reading = await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		expect(reading).toEqual({
			ok: true,
			model: DEFAULT_VISION_MODEL,
			items: [
				{ label: 'fried egg', searchQuery: 'fried egg', grams: 60 },
				{ label: 'green peas', searchQuery: 'green peas', grams: 25 }
			],
			usage: { promptTokens: 508, completionTokens: 78, totalTokens: 586 }
		});
	});

	it('carries the token counts back, so the bill can be audited', async () => {
		const sent = answering(
			completion(PLATE, { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 })
		);
		const reading = await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		expect(reading).toMatchObject({
			usage: { promptTokens: 11, completionTokens: 22, totalTokens: 33 }
		});
	});

	it('reports zero tokens rather than NaN when the upstream sends no usage', async () => {
		const sent = answering({ choices: [{ message: { content: '{"items":[]}' } }] });
		const reading = await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		expect(reading).toMatchObject({
			ok: true,
			usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
		});
	});

	it('reads an empty plate as an empty plate rather than a failure', async () => {
		const sent = answering(completion([]));
		const reading = await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		expect(reading).toMatchObject({ ok: true, items: [] });
	});

	it('reads a body with no choices in it as an empty plate', async () => {
		const sent = answering({ usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 } });
		const reading = await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		expect(reading).toMatchObject({ ok: true, items: [] });
	});

	it('reports zero tokens for a usage field that is not a number', async () => {
		const sent = answering(
			completion(PLATE, { prompt_tokens: 'many' } as unknown as Record<string, number>)
		);
		const reading = await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		expect(reading).toMatchObject({ usage: { promptTokens: 0 } });
	});

	it('never proposes more foods than a plate holds', async () => {
		const many = Array.from({ length: 20 }, (_unused, index) => ({
			label: `food ${index}`,
			search_query: `food ${index}`,
			grams: 10
		}));
		const sent = answering(completion(many));
		const reading = await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		expect(reading.ok && reading.items).toHaveLength(MAX_PLATE_ITEMS);
	});
});

describe('itemsFrom', () => {
	it('treats text that is not JSON as an empty plate', () => {
		expect(itemsFrom(saying('I see a plate of eggs'))).toEqual([]);
	});

	it('treats a truncated answer, which carries no content at all, as an empty plate', () => {
		expect(itemsFrom(saying(''))).toEqual([]);
	});

	it('treats a body with no choices in it as an empty plate', () => {
		expect(itemsFrom({ usage: {} })).toEqual([]);
	});

	it('treats an answer whose content is the JSON literal null as an empty plate', () => {
		expect(itemsFrom(saying('null'))).toEqual([]);
	});

	it('treats valid JSON that carries no items as an empty plate', () => {
		expect(itemsFrom(saying('{"foods":[]}'))).toEqual([]);
	});

	it('does not parse content that is an array rather than text', () => {
		// `JSON.parse` coerces, so a one-element array of the answer's text would
		// otherwise become real items no model actually sent.
		expect(
			itemsFrom(saying(['{"items":[{"label":"egg","search_query":"egg","grams":50}]}']))
		).toEqual([]);
	});

	it('reads the foods a well-formed answer names', () => {
		expect(
			itemsFrom(saying('{"items":[{"label":"egg","search_query":"egg","grams":50}]}'))
		).toEqual([{ label: 'egg', searchQuery: 'egg', grams: 50 }]);
	});

	it('drops a row with no label, which is nothing a person could correct', () => {
		expect(itemsFrom(saying('{"items":[{"label":"","search_query":"egg","grams":50}]}'))).toEqual(
			[]
		);
	});

	it('drops a label that is not text, which would reach the person as a food name', () => {
		expect(itemsFrom(saying('{"items":[{"label":5,"search_query":"egg","grams":50}]}'))).toEqual(
			[]
		);
	});

	it('drops a row with no search terms, which nothing could be looked up by', () => {
		expect(itemsFrom(saying('{"items":[{"label":"egg","search_query":"","grams":50}]}'))).toEqual(
			[]
		);
	});

	it('drops search terms that are not text, which nothing could be looked up by', () => {
		expect(itemsFrom(saying('{"items":[{"label":"egg","search_query":5,"grams":50}]}'))).toEqual(
			[]
		);
	});

	it('drops a weight that is not a positive number', () => {
		expect(itemsFrom(saying('{"items":[{"label":"egg","search_query":"egg","grams":0}]}'))).toEqual(
			[]
		);
	});

	it('drops a weight JSON parsed into Infinity, which no portion is', () => {
		expect(
			itemsFrom(saying('{"items":[{"label":"egg","search_query":"egg","grams":1e999}]}'))
		).toEqual([]);
	});

	it('keeps the good rows beside a bad one rather than losing the plate', () => {
		const content = '{"items":[{"label":"egg","search_query":"egg","grams":50},{"grams":3}]}';
		expect(itemsFrom(saying(content))).toEqual([{ label: 'egg', searchQuery: 'egg', grams: 50 }]);
	});
});

describe('when the call does not come back', () => {
	it('says unavailable, with the status, when the key is refused', async () => {
		const sent = answering({ error: { message: 'Incorrect API key provided: sk-abc123' } }, 401);
		const reading = await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		expect(reading).toEqual({ ok: false, reason: 'unavailable', status: 401 });
	});

	it('says unavailable when the account is rate limited', async () => {
		const sent = answering({ error: {} }, 429);
		const reading = await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		expect(reading).toEqual({ ok: false, reason: 'unavailable', status: 429 });
	});

	it('says unavailable when the upstream itself is broken', async () => {
		const sent = answering({ error: {} }, 500);
		const reading = await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		expect(reading).toEqual({ ok: false, reason: 'unavailable', status: 500 });
	});

	it('says unavailable with no status when the request times out', async () => {
		const sent = vi.fn<typeof fetch>(() =>
			Promise.reject(new DOMException('timed out', 'TimeoutError'))
		);
		const reading = await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		expect(reading).toEqual({ ok: false, reason: 'unavailable', status: null });
	});

	it('says unavailable when a 200 carries something that is not JSON', async () => {
		const sent = vi.fn<typeof fetch>(() =>
			Promise.resolve(new Response('<html>maintenance</html>'))
		);
		const reading = await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		expect(reading).toEqual({ ok: false, reason: 'unavailable', status: 200 });
	});

	it('never puts the key in what it reports about a failure', async () => {
		const sent = answering({ error: { message: `bad key ${KEY}` } }, 401);
		const reading = await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: KEY });
		expect(JSON.stringify(reading)).not.toContain(KEY);
	});

	it('sends nothing at all when no key is configured', async () => {
		vi.stubEnv('OPENAI_API_KEY', '');
		const sent = answering(completion(PLATE));
		const reading = await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: undefined });
		expect(reading).toEqual({ ok: false, reason: 'not-configured' });
		expect(sent).not.toHaveBeenCalled();
	});

	it('treats a blank key as no key', async () => {
		const sent = answering(completion(PLATE));
		const reading = await readPlate(IMAGE, 'lunch', { fetchImpl: sent, apiKey: '' });
		expect(reading).toEqual({ ok: false, reason: 'not-configured' });
		expect(sent).not.toHaveBeenCalled();
	});
});

describe('configuration', () => {
	it('reads the key from the environment', () => {
		expect(visionApiKey('sk-configured')).toBe('sk-configured');
	});

	it('reports no key when the variable is unset', () => {
		expect(visionApiKey(undefined)).toBeNull();
	});

	it('reports no key when the variable is blank', () => {
		expect(visionApiKey('   ')).toBeNull();
	});

	it('takes the key from the process environment by default', () => {
		vi.stubEnv('OPENAI_API_KEY', 'sk-from-the-process');
		expect(visionApiKey()).toBe('sk-from-the-process');
	});

	it('falls back to the model chosen by measurement', () => {
		expect(visionModel(undefined)).toBe(DEFAULT_VISION_MODEL);
		expect(DEFAULT_VISION_MODEL).toBe('gpt-5-nano');
	});

	it('lets a deployment name another model without a release', () => {
		expect(visionModel('gpt-4.1-nano')).toBe('gpt-4.1-nano');
	});

	it('treats a blank model as unset', () => {
		expect(visionModel('  ')).toBe(DEFAULT_VISION_MODEL);
	});

	it('takes the model from the process environment by default', () => {
		vi.stubEnv('OPENAI_VISION_MODEL', 'gpt-4o-mini');
		expect(visionModel()).toBe('gpt-4o-mini');
	});

	it('uses the configured key when none is passed in', async () => {
		vi.stubEnv('OPENAI_API_KEY', 'sk-ambient');
		const sent = answering(completion(PLATE));
		await readPlate(IMAGE, 'lunch', { fetchImpl: sent });
		expect(new Headers(firstCall(sent)[1].headers).get('authorization')).toBe('Bearer sk-ambient');
	});
});
