import { describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { RequestEvent } from './$types';

/**
 * The route file is one line, and that line is the whole of its behavior: it
 * has to reach the endpoint the URL promises, with the process-wide database
 * rather than one of its own. A wrapper that resolved to nothing, or to the
 * wrong handler, would be an authentication route that authenticates nothing —
 * and no unit test of `auth-endpoints.ts` would notice.
 */
const database = { name: 'application database' } as unknown as DatabaseSync;
const register = vi.fn(() => Promise.resolve(new Response(null, { status: 201 })));

vi.mock('$lib/server/db', () => ({ getDatabase: () => database }));
vi.mock('$lib/server/auth-endpoints', () => ({ register }));

const { POST } = await import('./+server');

describe('POST /api/accounts', () => {
	it('registers through the process-wide database and answers what it returns', async () => {
		const event = { url: new URL('https://fit.example/api/accounts') } as RequestEvent;
		const response = await POST(event);
		expect(register).toHaveBeenCalledWith(database, event);
		expect(response.status).toBe(201);
	});
});
