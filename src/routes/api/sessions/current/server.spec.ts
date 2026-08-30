import { describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { RequestEvent } from './$types';

/** See `../../accounts/server.spec.ts`: the wiring is the whole of a route file. */
const database = { name: 'application database' } as unknown as DatabaseSync;
const signOut = vi.fn(() => new Response(null, { status: 204 }));

vi.mock('$lib/server/db', () => ({ getDatabase: () => database }));
vi.mock('$lib/server/auth-endpoints', () => ({ signOut }));

const { DELETE } = await import('./+server');

describe('DELETE /api/sessions/current', () => {
	it('ends only the session this request presented', async () => {
		const event = { url: new URL('https://fit.example/api/sessions/current') } as RequestEvent;
		const response = await DELETE(event);
		expect(signOut).toHaveBeenCalledWith(database, event);
		expect(response.status).toBe(204);
	});
});
