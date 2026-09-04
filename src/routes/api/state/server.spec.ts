import { describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { RequestEvent } from './$types';

const database = { name: 'application database' } as unknown as DatabaseSync;
const readState = vi.fn(() => new Response('{}', { status: 200 }));
const writeState = vi.fn(() => new Response('{}', { status: 200 }));

vi.mock('$lib/server/db', () => ({ getDatabase: () => database }));
vi.mock('$lib/server/state/endpoints', () => ({ readState, writeState }));

const { GET, PUT } = await import('./+server');

describe('GET /api/state', () => {
	it('reads the household document from the application database', () => {
		const event = { url: new URL('https://fit.example/api/state') } as RequestEvent;
		const response = GET(event);
		expect(readState).toHaveBeenCalledWith(database, event);
		expect(response).toBeInstanceOf(Response);
	});
});

describe('PUT /api/state', () => {
	it('writes the household document to the application database', async () => {
		const event = { url: new URL('https://fit.example/api/state') } as RequestEvent;
		const response = await PUT(event);
		expect(writeState).toHaveBeenCalledWith(database, event);
		expect(response.status).toBe(200);
	});
});
