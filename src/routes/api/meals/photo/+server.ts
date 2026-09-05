import { getCatalog } from '$lib/server/catalog/connection';
import { getDatabase } from '$lib/server/db';
import { readMealPhoto } from '$lib/server/photo/endpoints';
import type { RequestHandler } from './$types';

/** Read one plate with the vision model and answer with catalog foods. */
export const POST: RequestHandler = (event) => readMealPhoto(getDatabase(), getCatalog(), event);
