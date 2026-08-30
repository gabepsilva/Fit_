# Fit_ quality system

Fit_ is developed primarily by AI agents, so its quality system exists to reject common
forms of low-quality generated code with repeatable evidence before a change can merge.
The gates are deliberately built before the features they will police, because an agent
has no incentive to add, after the fact, a check that fails its own output.

`README.md` has setup and the everyday commands. `AGENTS.md` has the rules agents must
follow. This file is the control inventory: what each area currently enforces, and what
future condition justifies adding more. Consult the table before proposing a new tool or
rule, because most gaps are deliberate and already have a stated trigger.

## Scope

Fit_ is a mobile web app for Android and iOS browsers, and the repository is still in
environment setup: the gates and the test infrastructure exist, the fitness application
does not. Rows below that read "deferred" or "must grow with features" describe the
intended state, not an oversight. Deployment infrastructure, TLS, cloud networking,
scaling, and production operations are out of scope until a hosting target exists.

## Quality model

- **Deterministic gates** return the same pass or fail verdict for the same code, tool
  versions, and scanner data. Only these block a merge.
- **Coverage that grows with the product** includes feature tests, E2E flows, and
  accessibility scenarios. The infrastructure exists, but every new feature must add its
  own evidence.
- **Advisory checks** depend on data that changes without a code change (Trivy's
  vulnerability feed, ZAP's observation of live traffic), so they run on a schedule and
  never block a merge.

Two standing principles govern changes to the gates themselves:

- **The bar is met, not moved.** Thresholds only ratchet upward, suppressions require a
  recorded justification, and every gate must prove through a self-test fixture that it
  rejects what it claims to reject.
- **Gates are reviewable, not sacred.** If a gate is observed pushing agents toward
  filler work — for example, tests written only to satisfy a coverage number rather than
  to catch a defect — the response is an open review of that gate, recorded here, never a
  silent workaround. Mutation testing exists precisely to catch assertion-free filler: a
  test that kills no mutants already fails the gate that matters.

Passing tools cannot prove that a feature satisfies its requirement. Acceptance criteria
and regression tests remain the primary evidence of behavioral correctness.

## Control inventory

The final column is deliberately trigger-based. "No action now" means another tool would
add more maintenance and noise than useful protection.

| Area                              | Current state | Current control                                                                                                                     | Next worthwhile action and trigger                                                                                                                                                                      |
| --------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formatting                        | Strong        | Prettier passes and is a hard gate.                                                                                                 | No action now. Add a rule only if a recurring formatting escape appears.                                                                                                                                |
| Type safety                       | Strong        | Strict TypeScript and Svelte warnings fail CI.                                                                                      | Add runtime schemas when untrusted API, form, environment, or persisted data first enters the application.                                                                                              |
| JavaScript and TypeScript smells  | Strong        | Type-aware ESLint rejects unsafe patterns and warnings.                                                                             | No extra linter now. Add a focused rule only after the same defect escapes review more than once.                                                                                                       |
| Svelte mistakes                   | Strong        | Compiler diagnostics and recommended Svelte rules are enforced.                                                                     | No action now. Revisit only for a framework upgrade or a demonstrated Svelte-specific escape.                                                                                                           |
| Test discipline                   | Strong        | Assertions are required; disabled, focused, and skipped tests are rejected.                                                         | No action now. Add a rule only when a repeated shallow-test pattern is identified.                                                                                                                      |
| Unit and component infrastructure | Strong        | Vitest server and real-browser component projects are gated.                                                                        | Add another test environment only when real code behaves differently outside the existing Node and browser targets.                                                                                     |
| Feature test breadth              | Partial       | The infrastructure exists, but the repository contains few behaviors.                                                               | Add acceptance tests with every feature, covering its success, failure, and permission paths.                                                                                                           |
| Numeric coverage                  | Partial       | Per-file line, function, branch, and statement thresholds are 80 percent.                                                           | Add changed-line coverage when project averages become large enough to hide untested new code.                                                                                                          |
| Mutation coverage                 | Partial       | Security and changed code use strict killed-only, per-file gates; a blocking full-tree lane retains the legacy aggregate score.     | Ratchet legacy full-tree timeouts, uncovered mutants, and weak files to zero/strict per-file only as tests make each improvement real.                                                                  |
| Gate self-test                    | Strong        | Every gate is proven to reject the input it claims to reject.                                                                       | Add a fixture with every new gate. A gate without one is unfinished work.                                                                                                                               |
| Threshold governance              | Strong        | A ratchet blocks silenced diagnostics and a guard blocks lowered thresholds.                                                        | No action now. These exist precisely so the bar cannot be moved instead of met.                                                                                                                         |
| Runtime pinning                   | Strong        | `.tool-versions` drives mise and both CI workflows from one file.                                                                   | Add a `check:runtimes` gate only if someone actually runs the gates on an unpinned runtime.                                                                                                             |
| E2E behavior                      | Partial       | A mobile viewport runs by default; CI adds iOS WebKit and desktop engines.                                                          | Add only critical user flows as they are implemented; do not create speculative browser tests.                                                                                                          |
| Accessibility                     | Partial       | Svelte diagnostics and runtime Axe checks cover exercised pages.                                                                    | Add scans for each new interactive page, modal, error state, and keyboard workflow.                                                                                                                     |
| Dead code and dependencies        | Strong        | Knip rejects unused files, exports, and dependencies.                                                                               | No action now. Configure new entry points only when Knip cannot discover a legitimate framework entry.                                                                                                  |
| Production build                  | Strong        | The optimized build runs through `adapter-node` and must produce `build/`.                                                          | Revisit the adapter only if the hosting target changes.                                                                                                                                                 |
| Static application security       | Strong        | Semgrep runs pinned general and project-specific rules.                                                                             | Add a project rule after a real security escape or when a new trust boundary introduces a known forbidden pattern.                                                                                      |
| Dependencies and secrets          | Strong        | Gitleaks scans tree/history; Trivy blocks High and Critical findings.                                                               | Add license or software inventory policy only before public distribution or compliance work.                                                                                                            |
| Runtime HTTP security             | Partial       | ZAP passively observes browser flows, but against the preview server.                                                               | Point ZAP at the `adapter-node` build, then add `nosniff` and frame-ancestors. Write a CSP once real content exists, and add active scanning only after a deployed auth or API surface makes it useful. |
| Persisted reports                 | Strong        | CI uploads quality and security evidence for 14 days.                                                                               | No action now. Increase retention only for audit, regulatory, or incident-response requirements.                                                                                                        |
| Tiered CI command                 | Strong        | One step list drives local runs and every hosted job.                                                                               | No action now. The tiers already split fast feedback from slow verification.                                                                                                                            |
| Duplication and complexity        | Strong        | Complexity, nesting, and parameters are capped; clones ratchet at zero.                                                             | No extra analyzer now. Add a targeted structural rule only after a recurring design smell bypasses these limits.                                                                                        |
| Bundle discipline                 | Strong        | JavaScript, CSS, and largest-asset byte budgets are enforced.                                                                       | Create route-specific or timing budgets once representative product pages and performance requirements exist.                                                                                           |
| Workflow integrity                | Strong        | Actionlint validates workflows; a semantic check ties declared CI jobs to GitHub Actions and Make; actions and runtimes are pinned. | Add policy only when a new privileged workflow or third-party action expands the attack surface.                                                                                                        |
| Hosted CI                         | Strong        | Every push runs the full gate in a clean GitHub-hosted environment.                                                                 | No action now. Add another platform only when the supported runtime actually requires it.                                                                                                               |
| Branch governance                 | Strong        | `main` requires a pull request and a passing `Quality and security` check.                                                          | Enable `enforce_admins`, and raise the approval count above zero, once a second person contributes.                                                                                                     |
| Agent guardrails                  | Strong        | Agents may not weaken gates, suppress findings, or skip tests.                                                                      | Add a guardrail only after an agent uses a new bypass that existing policy or tooling did not catch.                                                                                                    |
| Feature acceptance criteria       | Partial       | Pull requests require behavior and verification evidence.                                                                           | Do this for every feature: translate the requirement into executable acceptance or regression tests.                                                                                                    |
| Changed-code quality              | Strong        | Every changed in-scope production TypeScript logic file is mutation-tested; tests and documented data-only modules are not targets. | Add diff-specific numeric coverage only if mutation plus per-file coverage leaves a demonstrated changed-line escape.                                                                                   |
| Flake resistance                  | Partial       | Playwright uses controlled CI execution and fails tests classified as flaky.                                                        | Add repeat, seed, clock, or concurrency testing after the first flake or nondeterministic feature appears.                                                                                              |
| Architecture boundaries           | Deferred      | No guessed application layers are enforced.                                                                                         | Add cycle and import-direction rules after stable domain, service, or repository boundaries emerge.                                                                                                     |
| Semantic AI review                | Deferred      | None in CI. Agent review happens before the push, not after it.                                                                     | Reconsider an independent-model reviewer only if a pull request workflow is adopted and the deterministic gates are demonstrably missing semantic defects.                                              |
| Deployment infrastructure         | Out of scope  | Local build and behavior are the current quality target.                                                                            | Add deployment checks only after an actual hosting target becomes part of the product requirement.                                                                                                      |

## Recorded decisions and known gaps

- **Mutation feedback is lane-based without narrowing the security boundary (recorded
  2026-08-29).** A cold all-project Stryker run took roughly seventeen minutes because it
  started both Node and real-browser Vitest projects and generated more than 2,500 mutants.
  The same repository's incremental run completed in seventy seconds, and a cold Node-only
  authentication run first completed in 47.2 seconds and, after test/runner improvements,
  in 33 seconds for 544 mutants. The language was not the difference: scope, browser startup
  and cache temperature were. Pull requests now run four independent, blocking lanes.
  `security` discovers `hooks.server.ts`, every module below `$lib/server`,
  and every SvelteKit server route, then follows local runtime imports transitively. The two
  changed lanes mutate tracked and untracked Node and client files in the diff; non-security
  tests, deletions, renames and quality-configuration changes deliberately broaden the
  affected lane. Test, spec and end-to-end files provide tests but are never mutated as
  production sources. Security files and their co-located boundary specs are removed from changed
  lanes because the full security closure already tests them. Only explicit kills count in
  these strict lanes. Security requires 95 percent killed-only overall and 90 percent in
  every executable file; changed files require 80 percent per file and overall. A survivor
  without an exact review on an added or modified line fails either strict lane, as do any
  timeout, uncovered mutant, runtime or compile error, stale artifact, unexpected report
  file, missing executable file, or empty security scope. Exact reviewed equivalence or
  host-specific defense in depth is the sole exception: the report discloses that count
  separately and requires every observable changed mutant without a review to be killed.
  These limits live in `quality/mutation-policy.json`; the threshold ratchet guards both
  minimum scores and maximum failure counts.

  A broad changed-lane fallback distinguishes actual changed production files from unchanged
  background files in its deterministic scope. The changed files keep the complete strict
  verdict. The background must retain the historical 80 percent Stryker-compatible aggregate,
  and the verdict records `strict-changed-with-legacy-background`, both governing scores and
  all raw statuses. This catches a broad compatibility regression without relabeling existing
  legacy timeouts or uncovered mutants as defects introduced by the pull request. A changed
  production survivor still fails when its strict thresholds do not pass, even when the
  background score passes. Git change status is recorded independently from added-line ranges,
  so a deletion-only production edit retains strict per-file and zero-bad-status enforcement
  while correctly having no observable changed-line denominator.

  The fourth, full-tree lane remains a blocking pull-request check because it was blocking
  before this redesign. It preserves the historical Stryker-compatible aggregate threshold
  of 80 percent, where timeouts count as detected and invalid mutants do not enter the score;
  it does **not** claim strict per-file or zero-bad-status semantics. Existing legacy reports
  contain timeouts, uncovered mutants and weak individual files, so imposing the strict
  verdict immediately would create a knowingly red gate rather than assurance. The debt is
  explicit: remove those statuses and raise individual files through behavior tests, then
  ratchet the full policy toward the strict verdict without lowering its existing 80 percent
  aggregate bar. Regular CI runs the full lane incrementally on pull requests and pushes to
  `main`; the separate audit workflow is schedule/manual only and forces a cold run each
  Monday, avoiding duplicate `main` jobs and cache races. Every lane owns its cache, validates the configuration digest,
  performs a fresh dry run, and records cache metadata only after a passing verdict. A
  forced-cold audit independently checks that invalidation system.

  The CI contract derives every hosted job that invokes a gate slice and requires it in
  `all-green.needs`. This protects the required status aggregator from silently omitting a
  mutation, build, test, scanner or self-test job even when the workflow remains valid YAML.

  Local mutation concurrency is capped at the measured stable ceiling of nine workers. Ten
  workers allowed a Chromium-backed worker to be killed for memory pressure and made the next
  back-to-back Vitest initialization unreliable; nine retains the 31-second security result
  without trading trustworthy statuses for nominal parallelism. Hosted runners remain limited
  by their smaller core allocation.

  Reviewed survivors are not exclusions. `quality/mutation-equivalents.json` records only
  exact file, location, mutator, replacement and source hashes with a rationale and review
  URL. Wildcards and malformed entries fail a fast static gate; current source and report
  source must match; any new, moved, changed, or newly killed mutant invalidates its entry.

- **The JavaScript budget was raised to 320 KiB when the product UI landed (recorded
  2026-08-28).** The previous 150 KiB budget was set against a repository that carried
  only the SvelteKit demo routes, so it measured an empty application. Porting the front
  end took the build to 312 KiB of raw JavaScript, of which roughly 50 KiB is the food
  catalog and recipe data, and roughly 66 KiB is `bits-ui` and `svelte-sonner`. Two
  things make the raw figure a poor proxy for what a phone actually pays: the check sums
  every emitted chunk, including route code that is loaded lazily and never on first
  paint, and it counts uncompressed bytes. The same build is 111 KiB gzipped in total and
  about 79 KiB gzipped on first load. The budget was raised to sit just above the
  measured build rather than to a round aspiration, so it still fails on a careless
  dependency. CSS was left at 50 KiB and passes at 40 KiB. The better fix is to weigh
  transferred bytes and to budget the first-load path separately from lazily-loaded
  routes; that is the trigger for revisiting `scripts/quality/bundle-budget.ts`.
- **`--color-ink-subtle` is a placeholder color, not an ink (recorded 2026-08-29).** The
  exercise screens used it the way the design did, for small uppercase labels, and the Axe
  scans failed 82 times: `#9a9286` on a card is 2.87:1, against a 4.5:1 requirement. The
  same scan caught `--color-muted-foreground` failing on the tinted surfaces (4.16–4.47:1
  on `accent`, `secondary` and `muted`), and `--color-sage-soft` failing as both an ink on
  a card (2.78:1) and a fill under pale text (2.65:1). None of this is visible in a design
  file or to `svelte-check`; only a rendered scan finds it. The rules that came out of it:
  `ink-subtle` is for placeholder text only, `muted-foreground` is for text on `card` or
  `background` and `text-foreground/70` for text on a tint, and `sage-soft` carries dark
  text or none. The exercise tab is scanned screen by screen in `src/routes/exercise.e2e.ts`
  — the rotation, a running session, the routine sheet, the library sheet, both planners,
  the week sheet, the summary and progress — which is the pattern each new interactive
  page should follow rather than trusting the palette to be safe everywhere.
- **The JavaScript budget was raised to 400 KiB when the exercise tab landed (recorded
  2026-08-29).** The 320 KiB budget was measured against a six-route application; the
  exercise tab took it to fifteen routes, and the build to 391 KiB of raw JavaScript. The
  roughly 71 KiB added is the feature itself — nine screens, thirty components and the
  training domain — not a dependency: no package was added, and the icons are still deep
  imports. The same caveats as the previous raise apply and are why the raw figure
  overstates it: about 52 KiB of the addition sits in route chunks that load only when
  that screen is opened, and the whole build is 145 KiB gzipped, 129 KiB brotli. As
  before, the budget sits just above the measured build rather than at a round
  aspiration. This is the second raise for the same reason, which is the signal that the
  metric is wrong rather than the number: budgeting the first-load path separately from
  lazily-loaded routes, and weighing transferred bytes, is now overdue.
- **The JavaScript budget was raised to 414 KiB when sign-in landed, after the redirect
  guard was removed rather than paid for (recorded 2026-08-30).** The 400 KiB budget was
  measured against an application with no authentication interface. Adding `/signin`,
  `/signup`, the account block in the drawer, and the browser's side of the endpoints first
  took the build from 406,261 to 426,873 raw JavaScript bytes, and the budget was raised to
  420 KiB to match. Of that 20 KiB, 5,432 bytes were not the feature at all: they are
  SvelteKit's server-data pathway, which the client loads the moment a `+page.server.ts`
  exists anywhere in the app, and the repository's first two existed only to run a 303
  sending an already-signed-in visitor away from a form. Nothing was behind that guard —
  no destination is gated — and it never fired in the Capacitor build at all, so it was
  removed and the build measured again: 421,326 bytes. Hence 414 KiB rather than 420. What
  is left above the 400 KiB baseline is 15,065 bytes and is the feature: 6,468 bytes of
  route chunk for the two forms, loaded only when a form is opened, and the rest the auth
  client, the wording table, the session store and the account menu, which the drawer puts
  in the root layout chunk. No package was added and no icon import changed. As with the
  previous two raises the budget sits just above the measured build rather than at an
  aspiration — 2,610 bytes of headroom, tighter than either of them — so it still fails on
  a careless dependency, and the raw figure still overstates what a phone pays: the same
  build is 154 KiB gzipped and 137 KiB brotli. This is the third raise for the same reason
  and it does not change the conclusion recorded against the second, but it is the first
  one where the first move was to trim: 5,432 bytes came off by asking what the cost was
  buying. Budgeting the first-load path separately from lazily-loaded routes, and weighing
  transferred bytes, remains the fix.
- **A server `load` runs on one of the two targets, so behavior cannot live in one
  (recorded 2026-08-30).** `+layout.ts` sets `ssr = false`, so a `+page.server.ts` reaches
  the browser only through a `__data.json` request. The web build answers it. The Capacitor
  build is `adapter-static` with an SPA fallback, so the same request answers the fallback
  HTML, the client logs a JSON parse error, and `data` arrives empty — verified by building
  that target and loading it. Nothing catches this: it type-checks, it passes
  `bun run check`, and the end-to-end suite runs against the web build, which is the half
  that works. So a server `load` is web-only here until somebody decides whether the
  Android build has a server to talk to, and anything both targets need belongs in a
  universal load or in the component. The endpoints under `src/routes/api/` are unaffected:
  the Android build calls them over the network with a bearer token, which is what
  `hooks.server.ts` resolves alongside the cookie.
- **Mutation testing measures behavior, not seed data (recorded 2026-08-28).** The
  mutation glob was `src/lib/**/*.ts`, which swept in roughly 1,800 lines of catalog and
  fixture data and held the score at 53.84 percent against a break threshold of 80. Almost
  every survivor was a string literal in a food name, an alias list, a recipe note, or a
  demo meal template. Those mutants cannot be killed by design: the only test that fails when
  "Egg, large" becomes an empty string is a test that asserts the catalog's exact wording,
  which would freeze a fixture as if it were a contract and make every seed edit a test
  edit. The score was measuring how much data the repository carries, not how well its
  logic is tested. The fix was to split the data out rather than to move the bar: `FOODS`
  and its `f()` row builder, `CATEGORY_LABEL` and `PROVENANCE_LABEL` now live in
  `src/lib/domain/food-catalog.ts`, and `RECIPES` in `src/lib/domain/recipe-book.ts`, both
  re-exported from `foods.ts` and `recipes.ts` so no import site changed. Those two modules
  and `src/lib/domain/demo-seed.ts` are excluded from `mutate` in `stryker.config.mjs`.
  Everything that reads the data is still mutated at full strength: `FOOD_BY_ID`,
  `FOOD_BY_BARCODE`, `scaleFood`, `RECIPE_BY_ID`, `recipeMacros`, `recipeFits`, the grocery
  builder, the text parser, and the adaptive TDEE model. No threshold moved, and the
  excluded modules keep their existing tests and their place in coverage: `catalog.spec.ts`
  still checks that the catalog is non-empty, uniquely keyed, and fully labelled, and
  `demo-seed.spec.ts` still checks that the seeded journal has gaps, varied sources, and
  enough history for adaptive TDEE to engage. It asserts those properties without freezing
  the sample numbers, which is exactly the line the exclusion draws. Revisit this when real
  logic grows inside an excluded module — a food-catalog module that starts normalizing
  units, deriving micros, or resolving aliases is no longer data and belongs back in the
  glob, as does `demo-seed.ts` if the demo journal ever has to reproduce a specific history
  rather than a plausible one. The narrower answer, if Stryker ever supports it cleanly, is
  to exclude mutant types per file instead of whole files, so a genuine off-by-one in
  fixture arithmetic would still be caught.
- **The sign-in throttle counts against a declared address, not a guessed one (recorded
  2026-08-29).** The throttle's `address` scope exists to catch one client spraying a
  common password across many usernames, and it can only do that if the address it keys on
  is the client's. Behind a reverse proxy, `getClientAddress()` returns the innermost
  proxy, every caller lands in one bucket, and the scope stops catching spraying and starts
  locking a whole deployment out fifty failures at a time. `src/lib/server/client-address.ts`
  makes the deployment say which situation it is in through `FIT_CLIENT_ADDRESS`: `socket`
  (the default, and true of `vite dev` and of every environment this repository currently
  has), `forwarded`, or `none`. Declaring `forwarded` without `adapter-node`'s own
  `ADDRESS_HEADER` throws, so "we are behind a proxy" cannot be said without saying how to
  read past it — and no code here parses a forwarding header itself, because the adapter
  already reads `X-Forwarded-For` from the right against `XFF_DEPTH` rather than believing
  the leftmost value an attacker can prepend. One judgement call is recorded with its cost:
  a request arriving with a forwarding header at a server configured for a direct
  connection is a proxy nobody declared, so its address is dropped rather than counted. A
  client on a directly exposed server can therefore excuse itself from the address scope by
  sending an `X-Forwarded-For` of its own. It buys nothing against a single account — the
  `username` scope is keyed on the submitted name and counts every attempt regardless — and
  the trade is a spraying attacker opting out of a best-effort counter against a
  misconfigured deployment locking out all of its own users. The second is likelier and
  worse. Revisit when a hosting target exists: a deployment that knows its proxy's address
  can verify the peer instead of trusting the declaration.
- **ZAP scans the wrong server (recorded 2026-08-27).** ZAP proxies `vite preview`, but
  the project ships `adapter-node`, and the two serve different headers, so every
  "Cross-Domain Misconfiguration" alert is an artifact of the scanned server. The real
  findings from that run — missing CSP, anti-clickjacking header, and
  `X-Content-Type-Options` — are not exploitable while the application has no
  authentication, forms, or content. Fix order when acted on: point the scanner at the
  real server first, then add `nosniff` and frame-ancestors, and write a CSP last through
  SvelteKit's `kit.csp` once real content exists. A CSP authored against an empty
  application encodes nothing.
- **`engines` is documentation, not enforcement.** Bun ignores the `engines` field even
  with `engine-strict` set; the pin that matters is `.tool-versions`, which mise and both
  CI workflows read. A contributor without a version manager can still run the gates on
  the wrong runtime, which is the trigger for a `check:runtimes` gate.
- **`cookie` is deliberately not overridden.** The only fixed version is a major above
  the range `@sveltejs/kit` declares, and forcing it risks breaking cookie handling to
  clear a Low finding that does not gate. Transitive fixes inside an allowed range are
  pinned in the `overrides` block of `package.json` and dropped once the tree resolves to
  a patched version by itself.
- **Semantic AI review stays out of CI.** Deterministic gates cannot verify that, say, an
  authorization check exists on the server and not only in the interface, and an author
  model is the weakest reviewer of its own output. That second-model review currently
  happens through the agent's own tooling before the push, which is a tighter loop than
  an advisory comment after CI. A previous hosted Codex job could never fire under the
  direct-push workflow and was removed.
- **Provenance.** The project was scaffolded with `bunx sv@0.16.3 create . --template
minimal` plus the prettier, eslint, vitest, playwright, and mcp add-ons. The
  step-by-step assembly record lived in `Basic Start.md`, now removed; git history has
  it.
