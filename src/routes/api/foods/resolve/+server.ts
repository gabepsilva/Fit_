import { getCatalog } from '$lib/server/catalog/connection';
import { resolveFoodNames } from '$lib/server/catalog/resolve-endpoint';
import type { RequestHandler } from './$types';

/** Name the foods one typed sentence held. Read-only, and on a connection of its own. */
export const POST: RequestHandler = (event) => resolveFoodNames(getCatalog(), event);
