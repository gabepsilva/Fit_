import { getCatalog } from '$lib/server/catalog/connection';
import { searchCatalog } from '$lib/server/catalog/endpoints';
import type { RequestHandler } from './$types';

/** Search the food catalog. Read-only, and on a connection of its own. */
export const GET: RequestHandler = (event) => searchCatalog(getCatalog(), event);
