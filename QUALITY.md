# Fit_ quality system

Fit_ is developed primarily by AI agents, so its quality system exists to reject common
forms of low-quality generated code with repeatable evidence before a change can merge.
The gates are deliberately built before the features they will police, because an agent
has no incentive to add, after the fact, a check that fails its own output.

`README.md` has setup and commands. `AGENTS.md` has the rules agents must follow. This
file records what is already settled, so it is not re-argued, and what is deliberately
missing, so it is not proposed again.

## Standing rules

- **The bar is met, not moved.** Thresholds only ratchet upward, suppressions require a
  recorded justification, and every gate must prove through a self-test fixture that it
  rejects what it claims to reject. A gate without a fixture is unfinished work.
- **Gates are reviewable, not sacred.** If a gate is observed pushing agents toward filler
  work — tests written to satisfy a coverage number rather than to catch a defect — the
  answer is an open review of that gate, recorded here, never a silent workaround.
  Mutation testing exists to catch assertion-free filler: a test that kills no mutants
  already fails the gate that matters.
- **Only deterministic gates block a merge.** Checks whose findings change without a code
  change — Trivy's vulnerability feed, ZAP's observation of live traffic — run on a
  schedule and never gate. Do not promote them.
- Passing tools cannot prove a feature satisfies its requirement. Acceptance criteria and
  regression tests remain the primary evidence of behavioral correctness.

## Settled: do not propose additions here

Formatting, type safety, type-aware lint, Svelte diagnostics, test discipline, dead code,
duplication and complexity caps, secret scanning, SAST, bundle budgets, the production
build, workflow lint, report retention and branch protection are enforced and considered
done. Add a rule only after the same defect escapes review more than once, and record the
escape here when you do.

## Add these, when the trigger fires

| Add                                                                    | Trigger                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Runtime schemas                                                        | Untrusted API, form, environment, or persisted data first enters the application            |
| Acceptance tests for a feature's success, failure and permission paths | Every feature. The infrastructure exists and the behaviors do not; this is the standing gap |
| A self-test fixture                                                    | Every new gate, in the same change                                                          |
| An Axe scan                                                            | Every new interactive page, modal, error state and keyboard workflow                        |
| An end-to-end flow                                                     | A critical user flow is implemented. Never speculatively                                    |
| Import-direction and cycle rules                                       | Stable domain, service or repository boundaries emerge                                      |
| A `check:runtimes` gate                                                | Someone actually runs the gates on an unpinned runtime                                      |

## Decisions that change the code you write

- **A server `load` runs on one of the two targets, so behavior cannot live in one
  (recorded 2026-08-30).** `+layout.ts` sets `ssr = false`, so a `+page.server.ts` reaches
  the browser only through a `__data.json` request. The web build answers it; the Capacitor
  build is `adapter-static` with an SPA fallback, so the same request answers the fallback
  HTML and `data` arrives empty. Nothing catches this: it type-checks, it passes
  `bun run check`, and the end-to-end suite runs the web build, which is the half that
  works. A server `load` is web-only here; anything both targets need belongs in a
  universal load or in the component. Endpoints under `src/routes/api/` are unaffected —
  the Android build calls them with a bearer token, which `hooks.server.ts` resolves
  alongside the cookie.
- **`--color-ink-subtle` is a placeholder color, not an ink (recorded 2026-08-29).** Used
  for small uppercase labels the way the design did, it failed Axe 82 times: `#9a9286` on
  a card is 2.87:1 against a 4.5:1 requirement. The same scan caught
  `--color-muted-foreground` on tinted surfaces (4.16–4.47:1) and `--color-sage-soft` as
  both an ink on a card (2.78:1) and a fill under pale text (2.65:1). The rules: use
  `ink-subtle` for placeholder text only, `muted-foreground` for text on `card` or
  `background` and `text-foreground/70` for text on a tint, and give `sage-soft` dark text
  or none. None of this is visible to `svelte-check` or in a design file — only a rendered
  scan finds it, so scan each new page screen by screen the way
  `src/routes/exercise.e2e.ts` does.
- **The sign-in throttle counts against a declared address, not a guessed one (recorded
  2026-08-29).** Behind a proxy, `getClientAddress()` returns the proxy, so every caller
  lands in one bucket and the address scope locks out a whole deployment instead of
  catching password spraying. `FIT_CLIENT_ADDRESS` makes the deployment declare which
  situation it is in — `socket` (default), `forwarded`, or `none` — and declaring
  `forwarded` without `adapter-node`'s `ADDRESS_HEADER` throws. Never parse a forwarding
  header in this repository's own code; the adapter reads `X-Forwarded-For` from the right
  against `XFF_DEPTH` rather than believing the leftmost value an attacker can prepend. A
  forwarding header arriving at a server configured for a direct connection has its address
  dropped rather than counted: a spraying client can opt out of the address scope, which
  buys nothing against a single account because the `username` scope counts every attempt.

## Mutation testing

- **Lanes, not one run (recorded 2026-08-29).** Pull requests run four independent blocking
  lanes: the full Node-only server security closure, changed Node files, changed client
  files, and a full-tree compatibility audit. Test, spec and end-to-end files provide tests
  but are never mutated as production sources. Security files and their co-located boundary
  specs belong to the security lane alone. Every threshold lives in
  `quality/mutation-policy.json` and is guarded by the ratchet — read it there rather than
  restating numbers.
- **The full-tree lane keeps the legacy aggregate on purpose.** It preserves the historical
  Stryker-compatible 80 percent and does **not** claim strict per-file or zero-bad-status
  semantics, because existing reports contain timeouts, uncovered mutants and weak files,
  and imposing the strict verdict immediately would create a knowingly red gate rather than
  assurance. The debt is explicit: remove those statuses and raise individual files through
  behavior tests, then ratchet the full policy toward the strict verdict without lowering
  its 80 percent bar.
- **Mutation testing measures behavior, not seed data (recorded 2026-08-28).** A mutation
  glob of `src/lib/**/*.ts` swept in roughly 1,800 lines of catalog and fixture data and
  held the score at 53.84 percent; almost every survivor was a string literal in a food
  name or a recipe note. Those mutants cannot be killed except by asserting the catalog's
  exact wording, which freezes a fixture as if it were a contract. So `food-catalog.ts`,
  `recipe-book.ts` and `demo-seed.ts` are excluded from `mutate` in `stryker.config.mjs`
  while everything that reads them is still mutated at full strength. The line is data
  versus logic: a data module that starts normalizing units, deriving micros or resolving
  aliases belongs back in the glob.
- **Reviewed survivors are not exclusions.** `quality/mutation-equivalents.json` records
  exact file, location, mutator, replacement and source hashes with a rationale and a review
  URL. Wildcards and malformed entries fail a fast static gate, current source and report
  source must match, and any new, moved, changed or newly killed mutant invalidates its
  entry — so an unrelated edit above a reviewed mutant requires re-anchoring it, not
  deleting it.

## Recorded gaps and non-obvious choices

- **The JavaScript bundle budget sits just above the measured build, never at a round
  aspiration (recorded 2026-08-30, third raise).** It has been raised three times — 150 to
  320 to 400 to 414 KiB — each time against a measurement, each time leaving little
  headroom so it still fails on a careless dependency. Raise it only with the measurement
  that justifies it, and trim first: the last raise came down 5,432 bytes by deleting a
  `+page.server.ts` redirect guard that nothing was behind. The metric itself is the known
  flaw: it sums every emitted chunk including lazily-loaded routes, and counts uncompressed
  bytes where the same build is roughly a third the size gzipped. Budgeting the first-load
  path separately from lazy routes, and weighing transferred bytes, is the overdue fix to
  `scripts/quality/bundle-budget.ts`.
- **ESLint is deliberately not cached (recorded 2026-08-30).** A warm cache takes the lint
  step from 19.8 seconds to 1.3, and it is a false green. The cache key is a file's own
  bytes plus config, but `recommendedTypeChecked` decides a file from the whole type graph:
  making an exported function `async` in one file left the unchanged caller's now-floating
  promise unreported, exit 0, where the uncached run failed on it. Prettier and cspell do
  cache, because a per-file key covers every input they read. Do not "optimize" the lint
  gate with a cache.
- **ZAP scans the wrong server (recorded 2026-08-27).** ZAP proxies `vite preview` but the
  project ships `adapter-node`, and the two serve different headers, so every
  "Cross-Domain Misconfiguration" alert is an artifact of the scanned server. Fix order when
  acted on: point the scanner at the real server, then add `nosniff` and frame-ancestors,
  and write a CSP last through SvelteKit's `kit.csp` once real content exists. A CSP
  authored against an empty application encodes nothing.
- **`engines` is documentation, not enforcement.** Bun ignores it even with
  `engine-strict`; the pin that matters is `.tool-versions`, which mise and both CI
  workflows read.
- **`cookie` is deliberately not overridden.** The only fixed version is a major above the
  range `@sveltejs/kit` declares, and forcing it risks breaking cookie handling to clear a
  Low finding that does not gate. Transitive fixes inside an allowed range are pinned in
  `overrides` in `package.json` and dropped once the tree resolves to a patched version by
  itself.
- **Semantic AI review stays out of CI.** Deterministic gates cannot verify that an
  authorization check exists on the server and not only in the interface, and an author
  model is the weakest reviewer of its own output. That second-model review happens through
  the agent's own tooling before the push, which is a tighter loop than an advisory comment
  after CI.
