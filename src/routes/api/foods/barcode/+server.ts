import { getCatalog } from '$lib/server/catalog/connection';
import { lookupBarcode } from '$lib/server/catalog/endpoints';
import type { RequestHandler } from './$types';

/** Look one scanned barcode up in the food catalog. */
export const GET: RequestHandler = (event) => lookupBarcode(getCatalog(), event);
