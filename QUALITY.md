# Fit_ quality system

Fit_ is developed primarily by AI agents, so its quality system exists to reject common
forms of low-quality generated code with repeatable evidence before a change can merge.

The goal is quality code that builds and runs. Deployment infrastructure, TLS, cloud
networking, scaling, and production operations are deliberately outside the current scope.

This is the detailed reference. `README.md` has the everyday commands, `AGENTS.md` has the
rules agents must follow, and `Basic Start.md` records how the baseline was assembled.

## Scope note

Fit_ is a mobile web app for Android and iOS browsers, and the repository is still in
environment setup: the gates and the test infrastructure exist, the fitness application
does not. Several entries below therefore read "deferred" or "must grow with features".
That is the intended state, not an oversight.

## Current coverage summary

The final column is deliberately trigger-based. "No action now" means another tool would
add more maintenance and noise than useful protection.

| Area                              | Current state | Current control                                                               | Next worthwhile action and trigger                                                                                  |
| --------------------------------- | ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Formatting                        | Strong        | Prettier passes and is a hard gate.                                           | No action now. Add a rule only if a recurring formatting escape appears.                                            |
| Type safety                       | Strong        | Strict TypeScript and Svelte warnings fail CI.                                | Add runtime schemas when untrusted API, form, environment, or persisted data first enters the application.          |
| JavaScript and TypeScript smells  | Strong        | Type-aware ESLint rejects unsafe patterns and warnings.                       | No extra linter now. Add a focused rule only after the same defect escapes review more than once.                   |
| Svelte mistakes                   | Strong        | Compiler diagnostics and recommended Svelte rules are enforced.               | No action now. Revisit only for a framework upgrade or a demonstrated Svelte-specific escape.                       |
| Test discipline                   | Strong        | Assertions are required; disabled, focused, and skipped tests are rejected.   | No action now. Add a rule only when a repeated shallow-test pattern is identified.                                  |
| Unit and component infrastructure | Strong        | Vitest server and real-browser component projects are gated.                  | Add another test environment only when real code behaves differently outside the existing Node and browser targets. |
| Feature test breadth              | Partial       | The infrastructure exists, but the repository contains few behaviors.         | Add acceptance tests with every feature, covering its success, failure, and permission paths.                       |
| Numeric coverage                  | Partial       | Per-file line, function, branch, and statement thresholds are 80 percent.     | Add changed-line coverage when project averages become large enough to hide untested new code.                      |
| Mutation coverage                 | Strong        | Reusable TypeScript logic must reach an 80 percent mutation score.            | Extend mutation targets when meaningful domain or server logic exists outside the current target.                   |
| Gate self-test                    | Strong        | Every gate is proven to reject the input it claims to reject.                 | Add a fixture with every new gate. A gate without one is unfinished work.                                           |
| Threshold governance              | Strong        | A ratchet blocks silenced diagnostics and a guard blocks lowered thresholds.  | No action now. These exist precisely so the bar cannot be moved instead of met.                                     |
| E2E behavior                      | Partial       | A mobile viewport runs by default; CI adds iOS WebKit and desktop engines.    | Add only critical user flows as they are implemented; do not create speculative browser tests.                      |
| Accessibility                     | Partial       | Svelte diagnostics and runtime Axe checks cover exercised pages.              | Add scans for each new interactive page, modal, error state, and keyboard workflow.                                 |
| Dead code and dependencies        | Strong        | Knip rejects unused files, exports, and dependencies.                         | No action now. Configure new entry points only when Knip cannot discover a legitimate framework entry.              |
| Production build                  | Strong        | The optimized build runs through `adapter-node` and must produce `build/`.    | Revisit the adapter only if the hosting target changes.                                                             |
| Static application security       | Strong        | Semgrep runs pinned general and project-specific rules.                       | Add a project rule after a real security escape or when a new trust boundary introduces a known forbidden pattern.  |
| Dependencies and secrets          | Strong        | Gitleaks scans tree/history; Trivy blocks High and Critical findings.         | Add license or software inventory policy only before public distribution or compliance work.                        |
| Runtime HTTP security             | Partial       | ZAP passively observes browser-driven application traffic.                    | Add active scanning only after a deployed authentication or API surface makes it materially useful.                 |
| Persisted reports                 | Strong        | CI uploads quality and security evidence for 14 days.                         | No action now. Increase retention only for audit, regulatory, or incident-response requirements.                    |
| Tiered CI command                 | Strong        | One step list drives local runs and every hosted job.                         | No action now. The tiers already split fast feedback from slow verification.                                        |
| Duplication and complexity        | Strong        | Complexity, nesting, and parameters are capped; clones ratchet at zero.       | No extra analyzer now. Add a targeted structural rule only after a recurring design smell bypasses these limits.    |
| Bundle discipline                 | Strong        | JavaScript, CSS, and largest-asset byte budgets are enforced.                 | Create route-specific or timing budgets once representative product pages and performance requirements exist.       |
| Workflow integrity                | Strong        | Actionlint validates workflows; actions, runtimes, and containers are pinned. | Add policy only when a new privileged workflow or third-party action expands the attack surface.                    |
| Hosted CI                         | Strong        | Every push runs the full gate in a clean GitHub-hosted environment.           | No action now. Add another platform only when the supported runtime actually requires it.                           |
| Branch governance                 | Missing       | `main` is currently unprotected on this repository.                           | Do this now: require pull requests and the `CI / Quality and security` check before `main` accepts a change.        |
| Agent guardrails                  | Strong        | Agents may not weaken gates, suppress findings, or skip tests.                | Add a guardrail only after an agent uses a new bypass that existing policy or tooling did not catch.                |
| Feature acceptance criteria       | Partial       | Pull requests require behavior and verification evidence.                     | Do this for every feature: translate the requirement into executable acceptance or regression tests.                |
| Changed-code quality              | Partial       | Every change receives global coverage, mutation, lint, build, and test gates. | Add diff-specific coverage after the codebase grows enough for global percentages to mask a weak patch.             |
| Flake resistance                  | Partial       | Playwright uses controlled CI execution and fails tests classified as flaky.  | Add repeat, seed, clock, or concurrency testing after the first flake or nondeterministic feature appears.          |
| Architecture boundaries           | Deferred      | No guessed application layers are enforced.                                   | Add cycle and import-direction rules after stable domain, service, or repository boundaries emerge.                 |
| Semantic AI review                | Inactive      | The Codex workflow exists but no `OPENAI_API_KEY` secret is set, so it skips. | Set the secret and verify with one live pull request, or delete the workflow if it will not be used.                |
| Deployment infrastructure         | Out of scope  | Local build and behavior are the current quality target.                      | Add deployment checks only after an actual hosting target becomes part of the product requirement.                  |

## Quality model

The project uses three kinds of control:

- **Deterministic gates** return the same pass or fail decision for the same code, tool
  versions, and scanner data. These are allowed to block a merge.
- **Coverage that grows with the product** includes feature tests, E2E flows, and
  accessibility scenarios. The infrastructure exists, but every new feature must add its
  own evidence.
- **Advisory review** looks for semantic defects after deterministic CI passes. It is
  useful but probabilistic, so it does not block merges.

Passing tools cannot prove that a feature satisfies its requirement. Acceptance criteria
and regression tests remain the primary evidence of behavioral correctness.

## Commands

Checks are tiered by how long they take, so the loop you run most often stays short. Every
tier runs to completion and writes `reports/quality/gate-<tier>.json`.

| Command               | Scope                                                            | Needs            |
| --------------------- | ---------------------------------------------------------------- | ---------------- |
| `bun run precommit`   | Formatting, lint, suppression ratchet. Fail-fast.                | Nothing          |
| `bun run verify:fast` | Every static check plus server unit tests.                       | Nothing          |
| `bun run verify`      | Adds workflow lint, coverage, build, bundle budgets.             | Docker, Chromium |
| `bun run verify:deep` | Adds mutation testing, end-to-end flows, and the gate self-test. | Docker, Chromium |
| `bun run ci`          | The complete merge gate, including blocking security scanners.   | Docker, Chromium |
| `bun run nightly`     | Trivy and ZAP. Scheduled, never a merge gate.                    | Docker, Chromium |

Re-run a single step with `bun scripts/quality/gate.ts <tier> --only <step>`.

Generated evidence is written under `coverage/`, `playwright-report/`, `reports/`, and
`test-results/`. GitHub Actions uploads these for 14 days even when the gate fails.

## Deterministic controls

### Formatting

**Purpose:** Prevent formatting churn and agent-specific style differences.

**Implementation:** Prettier formats TypeScript, Svelte, JavaScript, JSON, Markdown, YAML, and project configuration. ESLint disables formatting rules that would conflict with Prettier.

**Gate:** `bun run format:check` fails when any tracked source or documentation file differs from the canonical format.

### Type safety

**Purpose:** Reject ambiguous values, unchecked access, inconsistent contracts, and unsafe error handling before execution.

**Implementation:** TypeScript strict mode is supplemented by `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, and `useUnknownInCatchVariables`. Project scripts are checked with a separate TypeScript configuration.

**Gate:** `bun run check` validates Svelte and application types with warnings treated as errors. `bun run check:scripts` validates the quality and security scripts without emitting files.

### JavaScript and TypeScript smells

**Purpose:** Catch unsafe or unclear implementation patterns that still compile.

**Implementation:** ESLint uses the recommended JavaScript rules and type-aware TypeScript rules. Explicit `any`, non-null assertions, inconsistent type imports, and non-exhaustive switches are errors. Unused suppression directives are also errors.

**Gate:** `bun run lint` allows zero warnings.

### Svelte mistakes

**Purpose:** Detect invalid markup, unsafe component patterns, and Svelte-specific mistakes.

**Implementation:** The Svelte compiler, `svelte-check`, and the recommended Svelte ESLint rules are enabled. Project Svelte code is forced into Svelte 5 runes mode. Buttons require an explicit type, and unsafe blank-target links are rejected.

**Gate:** `bun run check` and `bun run lint`.

### Test discipline

**Purpose:** Prevent tests that silently execute without proving anything or that agents disable to obtain a green build.

**Implementation:** Vitest requires assertions. Focused, disabled, commented-out, and unresolved to-do tests are lint errors. Playwright focused and skipped tests are also errors.

**Gate:** `bun run lint`, `bun run test:unit`, and `bun run test:e2e`.

### Unit and component infrastructure

**Purpose:** Exercise reusable logic and rendered Svelte components at the lowest practical level.

**Implementation:** Vitest has a Node-based server project and a real Chromium component project. This avoids pretending that browser component behavior is equivalent to a DOM simulation.

**Gate:** `bun run test:unit`.

### Numeric coverage

**Purpose:** Reject large regions of executable logic that tests never reach.

**Implementation:** Istanbul measures client/shared and server code separately. Lines, functions, branches, and statements each require at least 80 percent coverage. HTML and JSON summaries are preserved.

**Gate:** `bun run test:coverage`.

**Current limit:** Coverage is global rather than changed-line based. A high percentage proves execution, not useful assertions.

### Mutation coverage

**Purpose:** Detect tests that execute code but fail to notice incorrect results.

**Implementation:** Stryker mutates reusable TypeScript logic under `src/lib`, runs related Vitest tests, and requires an 80 percent mutation score. Surviving mutants remain visible in HTML and JSON reports.

**Gate:** `bun run test:mutation`.

**Current limit:** Svelte components and future server-only behavior are not yet mutation targets.

### End-to-end behavior

**Purpose:** Verify complete behavior through a real browser against a built application.

**Implementation:** Playwright builds the application, starts Vite preview on localhost, and runs the `mobile-chrome` project (Pixel 7 viewport, Chromium engine) by default. `E2E_ALL_BROWSERS` adds `mobile-safari` (iPhone 15, the WebKit engine iOS uses) plus desktop Chrome and Firefox as a responsive-regression backstop. CI runs the full matrix with one worker, forbids focused tests, rejects flaky tests, and does not update snapshots.

**Gate:** `bun run test:e2e` locally and `bun run test:e2e:all` for the full matrix.

**Current limit:** The infrastructure is strong, but the repository has only a small number of flows. Each feature must add its own acceptance path. `mobile-safari` cannot run on hosts where Playwright will not install WebKit's system libraries, which is Debian and Ubuntu only; CI is where that project is exercised.

### Accessibility

**Purpose:** Catch rendered accessibility failures that compilation cannot see.

**Implementation:** Playwright uses Axe against the rendered application. Svelte compiler accessibility diagnostics continue to catch static markup issues.

**Gate:** Accessibility assertions run as part of the E2E suite.

**Current limit:** Only visited pages and exercised states are scanned.

### Dead code and dependencies

**Purpose:** Prevent abandoned exports, unused files, and unnecessary packages from accumulating in agent-generated changes.

**Implementation:** Knip analyzes the source graph, entry points, exports, and package manifests.

**Gate:** `bun run knip`.

### Production build

**Purpose:** Ensure code accepted by editors and tests can still be compiled by SvelteKit and Vite.

**Implementation:** The optimized application build runs after static and behavioral checks.

**Gate:** `bun run build`, included in `bun run verify`.

**Implementation note:** `@sveltejs/adapter-node` is pinned in `vite.config.ts` so the build proves a deployable artifact. Under `adapter-auto` the build exited 0 while adapting to nothing and emitted no `build/` directory, so the gate proved compilation but never deployability.

### Static application security

**Purpose:** Reject known dangerous source patterns and security defects before runtime.

**Implementation:** Semgrep runs a hash-locked TypeScript rule pack plus project rules that reject dynamic code execution, disabled TLS verification, and `document.write`. The scanner container is digest-pinned and runs offline after its rule pack is verified.

**Gate:** `bun run security:semgrep` fails on a finding.

### Dependencies and secrets

**Purpose:** Prevent credentials from entering the repository and reject serious known dependency or configuration vulnerabilities.

**Implementation:** Gitleaks scans both the working tree and complete Git history with full redaction. Trivy scans development and production dependencies plus configuration. Scanner images are digest-pinned and containers are removed after use.

**Gate:** `bun run security:gitleaks` fails on any secret. `bun run security:trivy` fails on High or Critical findings while retaining lower-severity findings in its report.

**Determinism note:** The Trivy policy is deterministic, but its vulnerability database is intentionally refreshed. A newly published vulnerability can therefore fail unchanged application code.

**Patched transitive packages:** When a fix exists inside the range a parent already allows, it is pinned in the `overrides` block of `package.json` rather than waiting for the parent to re-release. Drop an override once the tree resolves to a patched version by itself.

### Runtime HTTP security

**Purpose:** Observe the HTTP behavior produced by real browser flows.

**Implementation:** The `mobile-chrome` Playwright project runs through a local, digest-pinned ZAP proxy. ZAP waits for passive scanning, emits JSON and HTML reports, and fails on High findings. Its container is constrained and removed after the test.

**Gate:** `bun run test:e2e:security`.

**Current limit:** ZAP sees only exercised browser traffic. Active attacks and broad crawling are outside the local anti-slop goal.

**Failure mode worth knowing:** ZAP reaches the preview server at `host.docker.internal:4173`. A host firewall that blocks the Docker bridge makes every proxied flow time out, and the run fails with an unreachable target rather than a security verdict. On a `ufw` host, allow it with `sudo ufw allow in on docker0`.

### Persisted reports

**Purpose:** Make failures easy to inspect instead of reducing them to a pass or fail badge.

**Implementation:** Coverage, mutation, duplication, bundle, browser, Gitleaks, Semgrep, Trivy, and ZAP reports are written to ignored directories. GitHub Actions uploads them even when an earlier check fails.

**Gate:** Report creation is part of each owning command; artifact upload uses `if: always()`.

### Unified CI command

**Purpose:** Give humans, agents, and GitHub one definition of done.

**Implementation:** Package scripts compose the same checks used individually. The hosted workflow calls the repository command rather than reimplementing its logic in YAML.

**Gate:** `bun run ci` must exit successfully.

### Duplication and complexity

**Purpose:** Prevent copy-pasted implementations and deeply branching agent-generated functions.

**Implementation:** ESLint limits cyclomatic complexity to 10, nesting depth to 4, and parameters to 4 for application source. JSCPD detects clones and ignores tests and generated content.

**Gate:** `bun run lint` and `bun run duplicates`. The duplication gate is a clone ratchet at zero, not a percentage. A percentage threshold weakens as the project grows, because 5 percent of a large codebase is far more duplication than 5 percent of a small one.

### Bundle discipline

**Purpose:** Prevent apparently small changes from adding disproportionate client weight.

**Implementation:** A project script measures built client JavaScript, CSS, and the largest individual asset. Current ceilings are 153,600 JavaScript bytes, 51,200 CSS bytes, and 76,800 bytes for the largest asset.

**Gate:** `bun run check:bundle` fails when a ceiling is exceeded and records the measured assets.

### Workflow integrity

**Purpose:** Prevent broken or ambiguous CI configuration from becoming the only definition of quality.

**Implementation:** Actionlint validates GitHub Actions syntax and expressions. GitHub Actions and scanner containers are pinned to immutable commit or image digests. The Bun and Node versions are explicit.

**Gate:** `bun run check:workflows`.

### Hosted CI

**Purpose:** Reproduce the gate in a clean environment outside an agent's workstation.

**Implementation:** GitHub Actions performs a frozen Bun install and runs the gate as parallel jobs, each selecting a named slice of the `ci` tier with `--job` rather than repeating the step list in YAML. Only the end-to-end job installs all three browser engines; the others need Chromium alone. Every job uploads its evidence, and concurrent runs for the same ref cancel superseded work.

**Gate:** The `Quality and security` job is required on protected `main`.

### Branch governance

**Purpose:** Prevent direct changes from bypassing the evidence-producing workflow.

**Current state:** Not configured. `main` on this repository accepts direct pushes, and no status check is required. The previous repository had these rules; they did not carry across when the project was re-initialized, because branch protection lives in GitHub settings rather than in the tree.

**Required action:** Protect `main` by requiring a pull request and the `CI / Quality and security` check, then block force pushes and branch deletion. Until that is done, the gate is advisory on `main` in practice: CI reports a failure but nothing stops the push. Approval count can stay at zero, leaving the deterministic gate as the merge authority.

### Suppression ratchet

**Purpose:** Stop a diagnostic being silenced instead of fixed.

**Implementation:** Every suppression comment must carry an issue key or URL on its line or the line above it. Unjustified suppressions are counted and compared against a recorded baseline.

**Gate:** `bun run check:suppressions` fails when the count exceeds the baseline. Raising that baseline is a deliberate, reviewed change, never a fix.

### Threshold governance

**Purpose:** Stop the bar being moved instead of met.

**Implementation:** `quality/thresholds.json` holds the numbers that decide whether a gate passes: coverage, mutation score, duplication, and the suppression baseline. A guard compares them against their committed values.

**Gate:** `bun run check:thresholds` fails when any threshold is lowered. The ratchet above prevents a finding being hidden; this prevents the measurement being weakened.

### Gate self-test

**Purpose:** Prove that a gate actually rejects what it claims to reject, rather than asserting it.

**Implementation:** For each gate, a deliberately broken input is applied to a disposable copy of the tree and the gate is expected to fail. Fixtures are generated at run time, because a stored fixture for the secret scanner would trip the secret scanner on this repository.

**Gate:** `bun run test:gates`. A new gate is not finished until it has a fixture, since an untested gate is a claim rather than a control.

### Agent guardrails

**Purpose:** Stop agents from making the measurement easier instead of improving the code.

**Implementation:** `AGENTS.md` forbids silently lowering thresholds, disabling tests, updating snapshots, suppressing diagnostics, or adding scanner exceptions. The pull request template asks for behavior, test, threshold, and report evidence.

**Gate:** Some rules are enforced by configuration; policy violations that remain syntactically valid require pull request review.

## Coverage that must grow with features

### Feature acceptance criteria

**Purpose:** Prove that implemented behavior matches the requirement rather than merely compiling.

**Current state:** The test infrastructure is ready, but feature correctness cannot be preconfigured. Every feature should translate its acceptance criteria into unit, component, or E2E tests at the narrowest useful level.

**Required practice:** A behavior change without corresponding evidence must be explained in the pull request.

### Changed-code quality

**Purpose:** Prevent new weakly tested code from hiding behind strong historical project averages.

**Current state:** Global coverage, mutation, lint, and build gates apply to every change. Changed-line coverage and diff-specific mutation thresholds are not configured.

**Next trigger:** Add a changed-code gate when the codebase is large enough for global percentages to conceal meaningful untested changes.

### Flake resistance

**Purpose:** Prevent intermittent tests from giving agents an unreliable success signal.

**Current state:** Playwright uses a single CI worker, allows one diagnostic retry, and fails the suite if a test is classified as flaky. CI cannot update snapshots. Unit tests are isolated but are not repeatedly executed with controlled random seeds.

**Next trigger:** Add repeat or seed-based testing after the first intermittent failure, randomized algorithm, clock-dependent behavior, or concurrency-sensitive feature appears.

### Architecture boundaries

**Purpose:** Prevent agents from creating cycles, bypassing layers, or importing server-only code into browser modules.

**Current state:** Deliberately deferred because the starter project has no meaningful application layers. Enforcing guessed boundaries would encode accidental structure as policy.

**Next trigger:** Once routes, services, repositories, or domain modules exist, define allowed dependency directions and make cycle and forbidden-import checks part of `bun run verify`.

## Advisory semantic review

### Codex review

**Purpose:** Look for requirement, authorization, contract, data-loss, concurrency, and error-handling defects that deterministic tools cannot prove.

**Implementation:** Codex runs only for same-repository pull requests and only after the deterministic gate succeeds. It receives a trusted prompt from the base commit, operates read-only without `sudo`, and is asked to report only actionable, high-confidence defects. A separate narrowly privileged job posts its result.

**Merge policy:** Advisory only. Model output is probabilistic and cannot replace deterministic checks or explicit acceptance tests.

**Current state:** Inactive. No `OPENAI_API_KEY` secret is set on this repository, so both Codex jobs skip on every run. Either set the secret and verify the review and comment path with one live pull request, or delete the workflow rather than leaving a permanently skipped job that reads like coverage.

## Deliberately out of scope

Deployment infrastructure, public networking, TLS, domains, scaling, backups, and cloud runtime operations are not measures of local code slop. They should be added only when Fit_ has an actual hosting target.

The project should not accumulate tools speculatively. When a recurring defect escapes the gate, add the smallest deterministic rule or regression test that detects that demonstrated failure mode.
