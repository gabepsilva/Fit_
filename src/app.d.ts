// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Auth } from '$lib/server/users/types';

declare global {
	/**
	 * The build's version, `v0.0.7` on a tagged build and `v0.0.7+be031ca`
	 * anywhere else. Substituted by `define` in `vite.config.ts`, which reads it
	 * from the git tag; `scripts/build/app-version.ts` has the derivation.
	 */
	const __APP_VERSION__: string;
	/** The commit that build was made from, or `unknown` when there was no git to ask. */
	const __APP_COMMIT__: string;

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
