// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Auth } from '$lib/server/users/types';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** Resolved once per request in `hooks.server.ts`; `null` when nobody is signed in. */
			auth: Auth | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
