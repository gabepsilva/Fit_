import { json } from '@sveltejs/kit';
import type { DatabaseSync } from 'node:sqlite';
import type { Meal } from '$lib/domain/types';
import { apiError } from '../api';
import { searchFoods, type CatalogFood } from '../catalog/foods';
import { readPhotoBody } from './request';
import { checkPhotoQuota, recordPhotoCall } from './quota';
import { readPlate, visionModel, type PlateItem, type PlateReading } from './vision';

/**
 * `POST /api/meals/photo`: what the vision model saw, resolved against the food
 * catalog.
 *
 * The model names foods and estimates weights; every calorie comes from
 * `searchFoods`. That split is the whole design — a model that hallucinates a
 * number cannot put it in anybody's day, only a wrong food the person can see
 * and correct.
 */

/** The part of SvelteKit's `RequestEvent` this handler uses, kept narrow as its siblings are. */
export type PhotoEvent = {
	request: Request;
	locals: App.Locals;
};

/**
 * One food the photo held. `food` is what the catalog ranked first for the
 * model's search terms and `alternatives` the two behind it, so a wrong first
 * guess is one tap from being right. `label` and `grams` are the model's own
 * and are all the person sees when the catalog matched nothing.
 */
export type PhotoItem = {
	label: string;
	grams: number;
	food: CatalogFood | null;
	alternatives: CatalogFood[];
};

/** The first hit, plus the two `alternatives` behind it. Three is what one search fetches. */
const CANDIDATES = 3;

export type PhotoDependencies = {
	/** Injected so every request shape and every upstream failure is testable without a network. */
	read: (image: string, meal: Meal) => Promise<PlateReading>;
	now: () => Date;
	/** One line per call, so the spend is auditable in `journalctl`. */
	log: (line: string) => void;
};

export const photoDependencies: PhotoDependencies = {
	read: (image, meal) => readPlate(image, meal),
	now: () => new Date(),
	log: (line) => console.info(line)
};

/** The catalog's answer for one thing the model saw. */
function resolveItem(catalog: DatabaseSync, item: PlateItem): PhotoItem {
	const found = searchFoods(catalog, item.searchQuery, CANDIDATES);
	return {
		label: item.label,
		grams: item.grams,
		food: found[0] ?? null,
		alternatives: found.slice(1, CANDIDATES)
	};
}

/**
 * `Retry-After` is whole seconds and never zero, for the reason
 * `auth-endpoints.ts` gives: a client told to wait must have something to wait
 * for, and rounding up keeps it from returning early only to be refused again.
 */
function overQuota(retryAfterMs: number): Response {
	const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
	return apiError('too-many-attempts', {}, { 'retry-after': String(seconds) });
}

/**
 * Read a plate.
 *
 * The order of the refusals is the order of what they cost: a session first,
 * then the body, then the catalog without which a reading would resolve to
 * nothing, then the day's allowance — and only then is anything sent to a paid
 * API. Nothing about the upstream reaches the caller: every way the model can
 * fail is one 503 with one code, because there is nothing the client could do
 * differently about any of them.
 */
export async function readMealPhoto(
	db: DatabaseSync,
	catalog: DatabaseSync | null,
	event: PhotoEvent,
	dependencies: PhotoDependencies = photoDependencies
): Promise<Response> {
	const auth = event.locals.auth;
	if (auth === null) return apiError('unauthenticated');

	const parsed = await readPhotoBody(event.request);
	if (!parsed.ok) return apiError(parsed.code);

	// Without the catalog every item would come back with no food and no
	// nutrition, so the money is not worth spending: this is the same answer
	// `/api/foods` gives a deployment that has no catalog file.
	if (catalog === null) return apiError('catalog-unavailable');

	const accountId = auth.account.id;
	const now = dependencies.now();
	const allowance = checkPhotoQuota(db, accountId, now);
	if (!allowance.allowed) return overQuota(allowance.retryAfterMs);

	const reading = await dependencies.read(parsed.image, parsed.meal);
	// Nothing was sent, so nothing is counted and nothing is logged as spend.
	if (!reading.ok && reading.reason === 'not-configured') return apiError('photo-unavailable');

	// Counted at the moment the request went out: a call that failed upstream was
	// still paid for.
	recordPhotoCall(db, accountId, now);

	if (!reading.ok) {
		dependencies.log(
			`photo: account=${accountId} model=${visionModel()} upstream=${reading.status ?? 'timeout'}`
		);
		return apiError('photo-unavailable');
	}

	const { promptTokens, completionTokens, totalTokens } = reading.usage;
	dependencies.log(
		`photo: account=${accountId} model=${reading.model} items=${reading.items.length} ` +
			`prompt=${promptTokens} completion=${completionTokens} total=${totalTokens}`
	);
	return json({ items: reading.items.map((item) => resolveItem(catalog, item)) });
}
