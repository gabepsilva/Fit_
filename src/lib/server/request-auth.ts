import type { DatabaseSync } from 'node:sqlite';
import { getDatabase } from './db';
import { resolveSession } from './users/sessions';
import type { Auth } from './users/types';

const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/i;

export type RequestAuthDependencies = {
	database: () => DatabaseSync;
	resolve: (db: DatabaseSync, token: string) => Auth | null;
};

export const requestAuthDependencies: RequestAuthDependencies = {
	database: getDatabase,
	resolve: resolveSession
};

/**
 * Read one session token without allowing an ambient cookie to override an
 * explicit Authorization header. A present but malformed header fails closed
 * instead of silently downgrading to the cookie.
 */
export function sessionTokenFrom(
	request: Request,
	cookieToken: string | undefined
): string | undefined {
	const authorization = request.headers.get('authorization');
	if (authorization !== null) return BEARER.exec(authorization)?.[1];
	return cookieToken && SESSION_TOKEN.test(cookieToken) ? cookieToken : undefined;
}

/** Resolve request authentication without opening the database for anonymous input. */
export function resolveRequestAuth(
	request: Request,
	cookieToken: string | undefined,
	dependencies: RequestAuthDependencies = requestAuthDependencies
): Auth | null {
	const token = sessionTokenFrom(request, cookieToken);
	return token ? dependencies.resolve(dependencies.database(), token) : null;
}
