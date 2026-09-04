import { getDatabase } from '$lib/server/db';
import { readState, writeState } from '$lib/server/state/endpoints';
import type { RequestHandler } from './$types';

/** Read this household's versioned document. */
export const GET: RequestHandler = (event) => readState(getDatabase(), event);

/** Write this household's document, provided the caller's expected version still matches. */
export const PUT: RequestHandler = (event) => writeState(getDatabase(), event);
