/**
 * The version this build carries, as one typed constant the interface can read.
 *
 * The value is substituted at build time by `define` in `vite.config.ts` — see
 * `scripts/build/app-version.ts` for where it comes from — so there is nothing
 * to fetch and nothing to keep in sync at runtime. `/api/version` answers with
 * the same two injected constants, which is what lets the deploy's smoke check
 * compare the server it just started against the release it just built.
 */
export const APP_VERSION: string = __APP_VERSION__;
