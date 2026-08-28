---
name: svelte
description: Write or change Svelte 5 components and SvelteKit routes in Fit_. Use when touching any `.svelte` file, `+page`/`+layout`/`+server`/`+page.server` module, hooks, load functions, form actions, or when asked about runes, snippets, stores, SSR, or SvelteKit routing. Covers the Svelte MCP documentation and autofixer loop plus this repository's conventions.
---

# Svelte development in Fit_

Fit_ is a **mobile web app**: SvelteKit on `@sveltejs/adapter-node`, served over HTTP and
opened in a phone browser. Design for a Pixel-7-sized viewport first; desktop is a
regression backstop, not the target.

## Consult the docs before writing, not after

The `svelte` MCP server carries the current Svelte 5 and SvelteKit documentation. Your
training data predates parts of it, and Svelte 5 changed enough that recalled patterns are
often stale.

1. `list-sections` first, at the start of the task. Read the `use_cases` field.
2. `get-documentation` for **every** section that matches the task — pass them in one call.
3. Only then write code.

Do this even when the answer feels obvious. The runes API, `$app/*` module surface, and
route-file contracts are exactly where confident recall goes wrong.

## Run the autofixer until it is silent

`svelte-autofixer` is mandatory for every `.svelte` file you write or modify, **before** the
change reaches the user. Feed it the component, apply what it returns, call it again. Keep
looping until it returns no issues and no suggestions — one pass is not enough, because
fixes surface further findings.

Never call `playground-link` for code written into this repository. It is for throwaway
snippets only, and only after the user asks.

## Repository conventions

- **Runes, not legacy syntax.** `$state`, `$derived`, `$effect`, `$props`. No `export let`,
  no `$:` reactive statements, no `svelte/store` for component-local state.
- **Snippets, not slots.** `{#snippet}` / `{@render}`, typed as `Snippet` from `svelte`.
  See `src/routes/+layout.svelte`.
- **Typed props.** Destructure with an inline type: `let { children }: { children: Snippet } = $props();`
- **Resolve internal links.** `import { resolve } from '$app/paths'` — see `src/routes/demo/+page.svelte`.
- **TypeScript everywhere.** `<script lang="ts">` on every component.
- **Tabs, single quotes.** Prettier owns formatting; run `bun run format` rather than
  hand-aligning.

## Server and client boundary

- Anything under `src/lib/server/` never reaches the browser. Secrets, database access, and
  authorization checks belong there and nowhere else.
- Enforce authorization in `+page.server.ts`, `+server.ts`, and form actions. A guard that
  only exists in a component is not a guard.
- Coverage is split: `src/lib/server/**` is measured by the `server` project, the rest by
  `client`. Put server-only logic in the right directory or it lands in the wrong report.

## Testing what you write

- Component tests run in a real browser through `vitest-browser-svelte`. Name them
  `*.svelte.spec.ts` beside the component — see `src/lib/vitest-examples/Welcome.svelte.spec.ts`.
- Plain TypeScript modules get `*.spec.ts`.
- End-to-end flows are Playwright, named `*.e2e.ts`, and run against `mobile-chrome`.
- Reusable domain logic and user-facing behavior need regression coverage before the change
  is finished.

## Before you call it done

- `bun run check` — `svelte-check` with `--fail-on-warnings`. A Svelte or type warning fails
  the gate; it is not advisory.
- `bun run verify:fast` after each change.
- `bun run verify` before declaring implementation work complete.

Read the gate result from `reports/quality/gate-<tier>.json`, not the console text. Never
silence a diagnostic to make a check pass — `AGENTS.md` and `QUALITY.md` govern that, and
they override any convenience here.
