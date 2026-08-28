# How the Fit_ quality baseline was built

This is the record of how the gates in this repository were assembled and why, plus an
honest table of what they do and do not catch. It is history and rationale, not a setup
guide: the project already exists, so nothing here needs to be run again. Day-to-day
commands live in `README.md`; the rules agents must follow live in `AGENTS.md`.

Fit_ is a mobile web app, so the end-to-end layer described below targets mobile
viewports first. See "Mobile-first end-to-end runs" in `README.md`.

## 1. The original scaffold

The project was created with a pinned CLI version so the scaffold was repeatable:

```bash
bunx sv@0.16.3 create . \
  --template minimal \
  --types ts \
  --add prettier eslint vitest="usages:unit,component" playwright mcp="ide:cursor+setup:local" \
  --install bun
```

| Option       | What and why                                                                         |
| ------------ | ------------------------------------------------------------------------------------ |
| `minimal`    | Starts with little generated code, keeping agent changes easy to review.             |
| `ts`         | Enables TypeScript and Svelte type checking.                                         |
| `prettier`   | Gives the project one automatic formatting standard.                                 |
| `eslint`     | Detects JavaScript, TypeScript, and Svelte code problems.                            |
| `vitest`     | Adds fast unit and component tests.                                                  |
| `playwright` | Tests complete user flows in a real browser.                                         |
| `mcp`        | Gives Cursor local access to current Svelte guidance; it is not a quality check.     |
| `bun`        | Installs dependencies quickly and creates the lockfile used for repeatable installs. |

## 2. Verifying the baseline

```bash
bun run verify
bun run ci
```

`verify` runs every deterministic check except Playwright E2E and the containerized security scans. `ci` runs the complete gate, including both. Commit `bun.lock`; do not silence warnings, skip tests, or weaken checks merely to make the pipeline green.

## 3. Hardening smell detection

The extra analyzers were added with:

```bash
bun add --dev @vitest/coverage-istanbul @vitest/eslint-plugin eslint-plugin-playwright knip @axe-core/playwright
bun add --dev --exact @stryker-mutator/core@10.0.0 @stryker-mutator/vitest-runner@10.0.0 cspell@10.1.1 jscpd@5.0.16 markdownlint-cli2@0.23.2
```

The project configuration then adds:

- Type-aware ESLint with zero warning tolerance and test anti-pattern rules.
- Stricter TypeScript compiler options and Svelte warnings as errors.
- Knip checks for unused files, exports, and dependencies.
- Istanbul coverage with 80% minimums for lines, functions, branches, and statements; browser and server coverage run separately for reliable teardown.
- Stryker mutation testing with an 80% hard minimum for reusable TypeScript logic.
- Playwright E2E on a mobile viewport by default, with the iOS WebKit engine and desktop browsers in the full matrix, plus Axe checks against rendered accessibility problems.
- Complexity, duplication, spelling, Markdown, bundle-budget, and GitHub workflow checks.
- Agent guardrails in `AGENTS.md` so quality gates cannot be silently weakened.

Use the same full gate locally and on the CI server:

```bash
bun ci
bunx playwright install --with-deps chromium
bun run ci
```

Here `bun ci` installs the lockfile exactly; `bun run ci` executes the project quality script. Chromium is enough for every gate, because end-to-end flows default to a mobile Chromium project.

## 4. The containerized security gate

Install Docker and keep its daemon running. The scanners stay outside the Bun dependency tree: each uses a digest-pinned image, writes a local report, and removes its container when finished.

```bash
bun run security:blocking    # Gitleaks history/tree and Semgrep source
bun run security:advisory    # Trivy dependencies/config and the ZAP-proxied mobile flows
bun run security             # all four security scanners
bun run ci                   # the complete merge gate
bun run nightly              # the scheduled advisory scanners alone
```

Gitleaks and Semgrep are derived from repository content, so they reproduce exactly and
block a merge. Trivy refreshes its vulnerability database and ZAP observes live traffic,
so both can change verdict with no code change; gating on them would contradict the
determinism promised above. They run on a schedule instead and open an issue.

| Scanner  | Gate                                                                | Report                                      |
| -------- | ------------------------------------------------------------------- | ------------------------------------------- |
| Gitleaks | Any secret in the working tree or Git history fails.                | `reports/security/gitleaks/` JSON files     |
| Semgrep  | Any finding from the hash-locked TypeScript or project rules fails. | `reports/security/semgrep/semgrep.json`     |
| Trivy    | High or Critical dependency or misconfiguration fails.              | `reports/security/trivy/trivy.json`         |
| ZAP      | E2E failure or High passive HTTP finding fails; lower risks remain. | `reports/security/zap/` JSON and HTML files |

Gitleaks, Semgrep, Actionlint, Trivy, and ZAP use digest-pinned containers that die after each command. Semgrep runs offline after its rule pack is hash-verified. ZAP disables update checks, proxies the `mobile-chrome` E2E flows, and waits for passive scanning. Trivy refreshes its vulnerability database when needed; that deliberate freshness means vulnerability results can change even when project code does not.

Baseline, re-measured 2026-08-27 with every scanner actually run: Gitleaks and Semgrep have
0 findings; Trivy has 1 Low and 0 High/Critical; ZAP has 15 Medium, 11 Low, 1 Informational,
and 0 blocking. Trivy and ZAP read external feeds, so their counts drift without any code
change, which is exactly why neither blocks a merge. These findings stay visible in the
reports. The table below grades detection coverage, not whether every reported smell has
been fixed.

### Patched transitive dependencies

Trivy blocks on High and Critical findings, and transitive packages drift into that band
between releases. When a fix exists inside the range the parent already allows, it is
pinned in the `overrides` block of `package.json` rather than waiting for the parent to
re-release. As of 2026-08-27 that covers `brace-expansion`, `fast-uri`, `nanoid`,
`postcss`, and `qs`.

Remove an override once the dependency tree resolves to a patched version on its own; a
stale override silently holds a package back. `cookie` is deliberately not overridden:
the only fix is 0.7.0, `@sveltejs/kit` declares `^0.6.0`, and forcing a major across that
boundary risks breaking cookie handling to clear a Low finding that does not gate.

### Running ZAP locally

ZAP runs in a container and proxies the preview server through
`http://host.docker.internal:4173`. The container gets there via
`--add-host=host.docker.internal:host-gateway`, so a host firewall that blocks the Docker
bridge makes every proxied flow time out, and `bun run nightly` fails with an unreachable
target rather than a security finding. That failure mode is easy to misread as a security
verdict; it is not one.

On a host running `ufw`, allow the bridge before running the advisory scanners:

```bash
sudo ufw allow in on docker0
```

Hosted CI has no such filter, which is where these scanners are scheduled to run anyway.

## 5. Enforcing the gate on GitHub

The pinned GitHub Actions workflow installs the exact Bun version and lockfile, then runs the
gates as parallel jobs: static analysis, unit and mutation, build and budgets, end-to-end across
the full mobile and desktop matrix, and blocking security. Each uploads its reports, and `all-green` passes only when
every one succeeds, so a formatting failure surfaces in about a minute instead of behind half an
hour of browser and container work. Protect `main` by requiring `CI / Quality and security` and
pull requests.

Codex runs afterward as a read-only advisory reviewer when `OPENAI_API_KEY` exists. Its CLI, model, prompt, permissions, and action commit are pinned, but its judgment remains probabilistic and therefore does not block merges.

## 6. Smell coverage: before and now

| Area                          | Before            | Now      | Difference                                                                             |
| ----------------------------- | ----------------- | -------- | -------------------------------------------------------------------------------------- |
| Formatting                    | Strong, failing   | Strong   | Prettier now passes and is a hard gate.                                                |
| Type errors                   | Strong            | Strong   | Added stricter compiler flags and made Svelte warnings fail.                           |
| JS/TS smells                  | Medium            | Strong   | ESLint is now type-aware, rejects unsafe patterns, and allows zero warnings.           |
| Svelte mistakes               | Strong            | Strong   | Retained compiler and recommended Svelte ESLint enforcement.                           |
| Test quality                  | Partial           | Strong   | Added assertion rules and an 80% mutation-score gate for reusable TypeScript.          |
| Unit/component behavior       | Basic             | Strong   | Vitest server and real-browser component projects are hard gates.                      |
| Numeric test coverage         | None              | Partial  | Added 80% thresholds; client/shared is 100%; no server-only source exists.             |
| E2E behavior                  | Basic             | Partial  | Flows run on a mobile viewport by default, all four projects in CI; breadth is small.  |
| Accessibility                 | Compile-time only | Partial  | Added a runtime Axe scan of the root page and fixed its initial violations.            |
| Dead code and dependencies    | None              | Strong   | Knip now rejects unused files, exports, and dependencies.                              |
| Production build              | Basic             | Strong   | The production build is now part of the mandatory gate.                                |
| Application security          | Minimal           | Strong   | Added Semgrep source rules plus ZAP observation of browser-driven application flows.   |
| Dependencies and secrets      | None              | Strong   | Gitleaks scans the tree/history; Trivy blocks High or Critical dependency findings.    |
| Runtime HTTP security         | None              | Partial  | ZAP passively scans proxied E2E traffic; active attacks and full crawling are absent.  |
| Persisted quality reports     | None              | Strong   | Coverage, mutation, duplication, bundle, Gitleaks, Semgrep, Trivy, and ZAP persist.    |
| CI command                    | None              | Strong   | `bun run ci` now runs all quality checks, direct E2E, and container security checks.   |
| Duplication and complexity    | None              | Strong   | Added ESLint complexity limits and a 5% maximum duplication threshold.                 |
| Architecture boundaries       | None              | None     | Still no layer, import-boundary, or dependency-cycle rules.                            |
| Performance and bundle budget | None              | Partial  | Added deterministic JS, CSS, and largest-asset byte budgets; no Lighthouse timing.     |
| Hosted CI workflow            | None              | Strong   | Pinned GitHub Actions runs the complete gate and uploads reports for every PR.         |
| Semantic AI review            | None              | Advisory | Codex reviews after CI with read-only permissions; probabilistic findings do not gate. |

This is a strong starting gate for agent-written code. Add architectural boundaries once the application structure becomes clear; premature layer rules would encode guesses rather than design.
