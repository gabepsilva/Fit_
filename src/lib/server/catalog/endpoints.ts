import { json } from '@sveltejs/kit';
import type { DatabaseSync } from 'node:sqlite';
import { apiError } from '../api';
import { foodsByBarcode, pageSize, searchFoods } from './foods';
import { barcodeOf } from './query';

/**
 * The part of SvelteKit's `RequestEvent` these handlers use — kept narrow for
 * the reason `AuthEvent` in `auth-endpoints.ts` gives.
 */
export type CatalogEvent = {
	url: URL;
	locals: App.Locals;
};

type Ready = { ok: true; catalog: DatabaseSync } | { ok: false; response: Response };

/**
 * Both handlers refuse in the same order: no session first, then no catalog.
 * Authorization is decided before anything is read, so an anonymous caller
 * learns nothing about whether this deployment even has a catalog.
 */
function ready(catalog: DatabaseSync | null, event: CatalogEvent): Ready {
	if (event.locals.auth === null) return { ok: false, response: apiError('unauthenticated') };
	// The 365 MB catalog is shipped separately and is absent in CI and on a
	// fresh checkout. That is a server-side gap rather than the caller's
	// mistake, and it is what tells the client to fall back to its bundled foods.
	if (catalog === null) return { ok: false, response: apiError('catalog-unavailable') };
	return { ok: true, catalog };
}

/** Ranked catalog matches for what a person typed. */
export function searchCatalog(catalog: DatabaseSync | null, event: CatalogEvent): Response {
	const gate = ready(catalog, event);
	if (!gate.ok) return gate.response;
	const query = event.url.searchParams.get('q') ?? '';
	const limit = pageSize(event.url.searchParams.get('limit'));
	return json({ query, foods: searchFoods(gate.catalog, query, limit) });
}

/**
 * The food or foods a scanned barcode names.
 *
 * `foods` is a list even for the ordinary single hit, and `ambiguous` says when
 * it holds more than one. The ETL reports 30 GTINs carried by more than one
 * row; picking one of them here would log the wrong food and say nothing, so
 * the choice goes back to the person who scanned it.
 */
export function lookupBarcode(catalog: DatabaseSync | null, event: CatalogEvent): Response {
	const gate = ready(catalog, event);
	if (!gate.ok) return gate.response;
	const code = event.url.searchParams.get('code');
	const barcode = code === null ? null : barcodeOf(code);
	if (barcode === null) return apiError('invalid-input', { field: 'code', reason: 'invalid' });
	const foods = foodsByBarcode(gate.catalog, barcode);
	if (foods.length === 0) return apiError('not-found', { field: 'code', reason: 'unknown' });
	return json({ barcode, ambiguous: foods.length > 1, foods });
}
