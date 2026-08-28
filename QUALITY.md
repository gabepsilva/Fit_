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

| Area                              | Current state | Current control                                                               | Next worthwhile action and trigger                                                                                                                                                                      |
| --------------------------------- | ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formatting                        | Strong        | Prettier passes and is a hard gate.                                           | No action now. Add a rule only if a recurring formatting escape appears.                                                                                                                                |
| Type safety                       | Strong        | Strict TypeScript and Svelte warnings fail CI.                                | Add runtime schemas when untrusted API, form, environment, or persisted data first enters the application.                                                                                              |
| JavaScript and TypeScript smells  | Strong        | Type-aware ESLint rejects unsafe patterns and warnings.                       | No extra linter now. Add a focused rule only after the same defect escapes review more than once.                                                                                                       |
| Svelte mistakes                   | Strong        | Compiler diagnostics and recommended Svelte rules are enforced.               | No action now. Revisit only for a framework upgrade or a demonstrated Svelte-specific escape.                                                                                                           |
| Test discipline                   | Strong        | Assertions are required; disabled, focused, and skipped tests are rejected.   | No action now. Add a rule only when a repeated shallow-test pattern is identified.                                                                                                                      |
| Unit and component infrastructure | Strong        | Vitest server and real-browser component projects are gated.                  | Add another test environment only when real code behaves differently outside the existing Node and browser targets.                                                                                     |
| Feature test breadth              | Partial       | The infrastructure exists, but the repository contains few behaviors.         | Add acceptance tests with every feature, covering its success, failure, and permission paths.                                                                                                           |
| Numeric coverage                  | Partial       | Per-file line, function, branch, and statement thresholds are 80 percent.     | Add changed-line coverage when project averages become large enough to hide untested new code.                                                                                                          |
| Mutation coverage                 | Strong        | Reusable TypeScript logic must reach an 80 percent mutation score.            | Extend mutation targets when meaningful domain or server logic exists outside the current target.                                                                                                       |
| Gate self-test                    | Strong        | Every gate is proven to reject the input it claims to reject.                 | Add a fixture with every new gate. A gate without one is unfinished work.                                                                                                                               |
| Threshold governance              | Strong        | A ratchet blocks silenced diagnostics and a guard blocks lowered thresholds.  | No action now. These exist precisely so the bar cannot be moved instead of met.                                                                                                                         |
| Runtime pinning                   | Strong        | `.tool-versions` drives mise and both CI workflows from one file.             | Add a `check:runtimes` gate only if someone actually runs the gates on an unpinned runtime.                                                                                                             |
| E2E behavior                      | Partial       | A mobile viewport runs by default; CI adds iOS WebKit and desktop engines.    | Add only critical user flows as they are implemented; do not create speculative browser tests.                                                                                                          |
| Accessibility                     | Partial       | Svelte diagnostics and runtime Axe checks cover exercised pages.              | Add scans for each new interactive page, modal, error state, and keyboard workflow.                                                                                                                     |
| Dead code and dependencies        | Strong        | Knip rejects unused files, exports, and dependencies.                         | No action now. Configure new entry points only when Knip cannot discover a legitimate framework entry.                                                                                                  |
| Production build                  | Strong        | The optimized build runs through `adapter-node` and must produce `build/`.    | Revisit the adapter only if the hosting target changes.                                                                                                                                                 |
| Static application security       | Strong        | Semgrep runs pinned general and project-specific rules.                       | Add a project rule after a real security escape or when a new trust boundary introduces a known forbidden pattern.                                                                                      |
| Dependencies and secrets          | Strong        | Gitleaks scans tree/history; Trivy blocks High and Critical findings.         | Add license or software inventory policy only before public distribution or compliance work.                                                                                                            |
| Runtime HTTP security             | Partial       | ZAP passively observes browser flows, but against the preview server.         | Point ZAP at the `adapter-node` build, then add `nosniff` and frame-ancestors. Write a CSP once real content exists, and add active scanning only after a deployed auth or API surface makes it useful. |
| Persisted reports                 | Strong        | CI uploads quality and security evidence for 14 days.                         | No action now. Increase retention only for audit, regulatory, or incident-response requirements.                                                                                                        |
| Tiered CI command                 | Strong        | One step list drives local runs and every hosted job.                         | No action now. The tiers already split fast feedback from slow verification.                                                                                                                            |
| Duplication and complexity        | Strong        | Complexity, nesting, and parameters are capped; clones ratchet at zero.       | No extra analyzer now. Add a targeted structural rule only after a recurring design smell bypasses these limits.                                                                                        |
| Bundle discipline                 | Strong        | JavaScript, CSS, and largest-asset byte budgets are enforced.                 | Create route-specific or timing budgets once representative product pages and performance requirements exist.                                                                                           |
| Workflow integrity                | Strong        | Actionlint validates workflows; actions, runtimes, and containers are pinned. | Add policy only when a new privileged workflow or third-party action expands the attack surface.                                                                                                        |
| Hosted CI                         | Strong        | Every push runs the full gate in a clean GitHub-hosted environment.           | No action now. Add another platform only when the supported runtime actually requires it.                                                                                                               |
| Branch governance                 | Strong        | `main` requires a pull request and a passing `Quality and security` check.    | Enable `enforce_admins`, and raise the approval count above zero, once a second person contributes.                                                                                                     |
| Agent guardrails                  | Strong        | Agents may not weaken gates, suppress findings, or skip tests.                | Add a guardrail only after an agent uses a new bypass that existing policy or tooling did not catch.                                                                                                    |
| Feature acceptance criteria       | Partial       | Pull requests require behavior and verification evidence.                     | Do this for every feature: translate the requirement into executable acceptance or regression tests.                                                                                                    |
| Changed-code quality              | Partial       | Every change receives global coverage, mutation, lint, build, and test gates. | Add diff-specific coverage after the codebase grows enough for global percentages to mask a weak patch.                                                                                                 |
| Flake resistance                  | Partial       | Playwright uses controlled CI execution and fails tests classified as flaky.  | Add repeat, seed, clock, or concurrency testing after the first flake or nondeterministic feature appears.                                                                                              |
| Architecture boundaries           | Deferred      | No guessed application layers are enforced.                                   | Add cycle and import-direction rules after stable domain, service, or repository boundaries emerge.                                                                                                     |
| Semantic AI review                | Deferred      | None in CI. Agent review happens before the push, not after it.               | Reconsider an independent-model reviewer only if a pull request workflow is adopted and the deterministic gates are demonstrably missing semantic defects.                                              |
| Deployment infrastructure         | Out of scope  | Local build and behavior are the current quality target.                      | Add deployment checks only after an actual hosting target becomes part of the product requirement.                                                                                                      |

## Recorded decisions and known gaps

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
