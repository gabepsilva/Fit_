import type { Meal } from '$lib/domain/types';

/**
 * Reading a plate with a vision model.
 *
 * The model is asked for names, search terms and portion weights and for
 * nothing else: every nutrient the app records comes from the food catalog, so
 * a model that invents a number cannot put it in anybody's day. What comes back
 * is a shopping list of search queries, and `endpoints.ts` is what turns those
 * into foods.
 *
 * This is the only outbound HTTP call the server makes, so `fetchImpl` is a
 * parameter with a default — the same shape `catalogPath` and
 * `applicationDatabasePath` use for their configuration — and every request
 * shape and every upstream failure below is asserted without a network.
 */

/**
 * Chosen by measurement against the account's own model list on 2026-09-04.
 * `gpt-5-nano` is the cheapest vision-capable model the key can reach
 * ($0.05/M input, $0.40/M output, against $0.10/$0.40 for `gpt-4.1-nano` and
 * $0.20/$1.25 for `gpt-5.4-nano`), and on a measured plate it read 508 prompt +
 * 78 completion tokens — about $0.000057, a two-hundredth of a cent.
 */
export const DEFAULT_VISION_MODEL = 'gpt-5-nano';

/** Twenty seconds: past this a person has given up on the shutter, not on the network. */
export const VISION_TIMEOUT_MS = 20_000;

/** More foods than a plate holds; the prompt says so and the parse enforces it. */
export const MAX_PLATE_ITEMS = 8;

/**
 * Enough for eight items of structured output with room to spare — the measured
 * four-item answer was 78 tokens — and a hard ceiling on what one call can cost
 * if a future model decides to think out loud.
 */
const MAX_OUTPUT_TOKENS = 600;

const COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT =
	'Identify the distinct foods and drinks on the plate. Estimate each portion in grams. ' +
	'Give a plain catalog search query in singular generic terms ' +
	'("chicken breast grilled", not brand names). Skip cutlery, tableware and garnish. ' +
	`At most ${MAX_PLATE_ITEMS} items. Return an empty list when the picture holds no food.`;

/**
 * `strict` makes the shape a constraint on decoding rather than a request, so
 * the only parse failure left is a truncated answer.
 */
const RESPONSE_FORMAT = {
	type: 'json_schema',
	json_schema: {
		name: 'plate',
		strict: true,
		schema: {
			type: 'object',
			additionalProperties: false,
			required: ['items'],
			properties: {
				items: {
					type: 'array',
					items: {
						type: 'object',
						additionalProperties: false,
						required: ['label', 'search_query', 'grams'],
						properties: {
							label: { type: 'string' },
							search_query: { type: 'string' },
							grams: { type: 'number' }
						}
					}
				}
			}
		}
	}
} as const;

/** One food the model saw, in its own words. No nutrition: that is the catalog's job. */
export type PlateItem = {
	/** What the model says it is, shown to the person when the catalog has no match. */
	label: string;
	/** Generic singular terms for `searchFoods`. */
	searchQuery: string;
	/** The model's portion estimate. */
	grams: number;
};

/** What the call cost, as the upstream reports it. Logged so the bill is auditable. */
type PlateUsage = { promptTokens: number; completionTokens: number; totalTokens: number };

export type PlateReading =
	| { ok: true; model: string; items: PlateItem[]; usage: PlateUsage }
	/** No key is configured, so nothing was sent and nothing was spent. */
	| { ok: false; reason: 'not-configured' }
	/**
	 * A request went out and did not come back usable. `status` is the upstream's,
	 * or `null` for a timeout or a dropped connection; it is logged and never sent
	 * to the caller, because it is a fact about this deployment's account.
	 */
	| { ok: false; reason: 'unavailable'; status: number | null };

export type VisionOptions = {
	fetchImpl?: typeof fetch;
	apiKey?: string | undefined;
	model?: string;
	timeoutMs?: number;
};

/**
 * The gpt-5 family reasons before it answers, and at the default effort
 * `gpt-5-nano` spent an entire 2000-token cap on reasoning and returned an
 * empty message with `finish_reason: "length"` — measured, not feared. Asking
 * for minimal effort is what makes it answer at all. The parameter does not
 * exist on the 4.x models, which reject the request outright, so it goes only
 * to the family that has it: `OPENAI_VISION_MODEL` is a real escape hatch and
 * must not turn into a 400 the moment somebody uses it.
 */
function reasoningEffortFor(model: string) {
	return model.startsWith('gpt-5') ? ({ reasoning_effort: 'minimal' } as const) : {};
}

function requestBody(image: string, meal: Meal, model: string) {
	return {
		model,
		max_completion_tokens: MAX_OUTPUT_TOKENS,
		...reasoningEffortFor(model),
		response_format: RESPONSE_FORMAT,
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{
				role: 'user',
				content: [
					{ type: 'text', text: `This is ${meal}.` },
					// `low` fixes the image at the model's small tile, which is what
					// keeps a call at a fraction of a cent; a 720 px plate needs no more.
					{ type: 'image_url', image_url: { url: image, detail: 'low' } }
				]
			}
		]
	};
}

function fieldsOf(value: unknown): Record<string, unknown> {
	return (value ?? {}) as Record<string, unknown>;
}

/**
 * A token count, or zero. `Number.isFinite` does not coerce, so it is already
 * false for a string, a `null` or an absent field, and a separate `typeof`
 * would be a branch no upstream body could take differently.
 */
function countedTokens(value: unknown): number {
	return Number.isFinite(value) ? (value as number) : 0;
}

function usageOf(body: Record<string, unknown>): PlateUsage {
	const usage = fieldsOf(body['usage']);
	return {
		promptTokens: countedTokens(usage['prompt_tokens']),
		completionTokens: countedTokens(usage['completion_tokens']),
		totalTokens: countedTokens(usage['total_tokens'])
	};
}

/**
 * A portion weight, or not one. `Number.isFinite` is false for every value that
 * is not a number, so it carries the type check; `1e999` in a JSON body parses
 * to `Infinity`, which is why finiteness is asked about at all.
 */
function isPortion(value: unknown): value is number {
	return Number.isFinite(value) && (value as number) > 0;
}

/**
 * One item, or `null`. A nameless row is nothing the person could correct, and a
 * row with no search terms is nothing the catalog could be asked about.
 *
 * Each `typeof` here is load-bearing: without it a number or an array reaches
 * the client as a food's name, since neither is caught by the emptiness check
 * beside it.
 */
function itemOf(value: unknown): PlateItem | null {
	const row = fieldsOf(value);
	const label = row['label'];
	const searchQuery = row['search_query'];
	const grams = row['grams'];
	if (typeof label !== 'string' || label === '') return null;
	if (typeof searchQuery !== 'string' || searchQuery === '') return null;
	if (!isPortion(grams)) return null;
	return { label, searchQuery, grams };
}

/** The parsed text, or `null` for text that is not JSON. */
function parsedJson(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}

/**
 * The foods a completion names.
 *
 * A refusal, a truncation, a body of some other shape and an answer that is not
 * JSON all read as an empty plate rather than as a failure: the person is told
 * the photo held no food they can log, which is true, and is offered typing —
 * where "the model is having a bad day" would offer them nothing to do.
 */
export function itemsFrom(body: Record<string, unknown>): PlateItem[] {
	const choices = body['choices'];
	// `unknown`, because `Array.isArray` narrows an `unknown` to `any[]`.
	const first: unknown = Array.isArray(choices) ? choices[0] : null;
	const content = fieldsOf(fieldsOf(first)['message'])['content'];
	// `JSON.parse` coerces its argument, so an array holding the answer's text
	// would parse into real items no model sent. Only text is read.
	const parsed = typeof content === 'string' ? parsedJson(content) : null;
	if (parsed === null) return [];
	const rows = (parsed as Record<string, unknown>)['items'];
	if (!Array.isArray(rows)) return [];
	const items: PlateItem[] = [];
	for (const row of rows) {
		const item = itemOf(row);
		if (item !== null) items.push(item);
	}
	return items.slice(0, MAX_PLATE_ITEMS);
}

/** The configured key, or `null` when this deployment has none. Blank counts as none. */
export function visionApiKey(configured = process.env['OPENAI_API_KEY']): string | null {
	const key = configured?.trim();
	return key === undefined || key === '' ? null : key;
}

/** The configured model, or the measured default. */
export function visionModel(configured = process.env['OPENAI_VISION_MODEL']): string {
	const model = configured?.trim();
	return model === undefined || model === '' ? DEFAULT_VISION_MODEL : model;
}

/**
 * Every option filled in from the environment, so the call itself has no
 * decisions left to make. `visionApiKey` reads the environment when the caller
 * named no key, and turns a blank one into `null`.
 */
function settings(options: VisionOptions) {
	return {
		fetchImpl: options.fetchImpl ?? fetch,
		apiKey: visionApiKey(options.apiKey),
		model: options.model ?? visionModel(),
		timeoutMs: options.timeoutMs ?? VISION_TIMEOUT_MS
	};
}

/**
 * Ask the model what is on the plate.
 *
 * Never throws: a refusal, a rate limit, a dead socket and a timeout are all
 * outcomes a caller has to answer, so they are values. The key is used and
 * never returned, logged or put in a message — the only thing that leaves here
 * about a failure is the upstream status number.
 */
export async function readPlate(
	image: string,
	meal: Meal,
	options: VisionOptions = {}
): Promise<PlateReading> {
	const { fetchImpl, apiKey, model, timeoutMs } = settings(options);
	if (apiKey === null) return { ok: false, reason: 'not-configured' };

	let response: Response;
	try {
		response = await fetchImpl(COMPLETIONS_URL, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${apiKey}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify(requestBody(image, meal, model)),
			signal: AbortSignal.timeout(timeoutMs)
		});
	} catch {
		// A timeout and a dropped connection are the same fact: no answer arrived.
		return { ok: false, reason: 'unavailable', status: null };
	}
	if (!response.ok) return { ok: false, reason: 'unavailable', status: response.status };

	let body: unknown;
	try {
		body = await response.json();
	} catch {
		return { ok: false, reason: 'unavailable', status: response.status };
	}
	const fields = fieldsOf(body);
	return { ok: true, model, items: itemsFrom(fields), usage: usageOf(fields) };
}
