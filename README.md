# Fit_

[![CI](https://github.com/gabepsilva/Fit_/actions/workflows/ci.yml/badge.svg)](https://github.com/gabepsilva/Fit_/actions/workflows/ci.yml)

A fitness application for Android and iOS, built on SvelteKit. Food logging, an adaptive
calorie and macro model, a household meal plan, and progress tracking, behind a set of
deterministic, reviewable quality gates.

Data currently lives in the browser's `localStorage`. The SQLite backend is not built yet,
so nothing leaves the device and nothing syncs between devices.

## Requirements

- Bun and Node at the versions in `.tool-versions`
- Docker with a running daemon
- Chromium, installed through Playwright

`.tool-versions` is the single source of truth for both runtimes. `mise` reads it
directly, and both CI workflows resolve their versions from it, so local and hosted runs
cannot drift apart. Bun installs dependencies and runs the project's own TypeScript, but
every tool that decides whether a gate passes ships a `#!/usr/bin/env node` shebang and
therefore executes under Node, which is why the Node version is pinned too.

```bash
bun install --frozen-lockfile
bunx playwright install --with-deps chromium
```

Chromium alone runs every gate, up to and including `bun run ci`, because end-to-end
flows default to a mobile Chromium project. Add the other engines only if you want to
run the full matrix locally:

```bash
bunx playwright install --with-deps firefox webkit
```

Playwright installs WebKit's system libraries only on Debian and Ubuntu. On other
distributions `--with-deps` fails, `mobile-safari` cannot run locally, and CI is where
that project gets exercised.

## Development

```bash
bun run dev
```

## Quality gates

Checks are tiered by how long they take, so the loop you run most often stays short.
Every tier runs to completion and aggregates its results, rather than stopping at the
first failure and making you pay another round trip per error.

| Command               | Purpose                                              | Requires         |
| --------------------- | ---------------------------------------------------- | ---------------- |
| `bun run precommit`   | Formatting, lint, suppression ratchet. Fail-fast.    | Nothing          |
| `bun run verify:fast` | Every static check plus server unit tests.           | Nothing          |
| `bun run verify`      | Adds workflow lint, coverage, build, bundle budgets. | Docker, Chromium |
| `bun run verify:deep` | Adds mutation testing and end-to-end flows.          | Docker, browsers |
| `bun run ci`          | Adds Gitleaks and Semgrep. The merge gate.           | Docker, browsers |
| `bun run nightly`     | Trivy and ZAP. Scheduled, never a merge gate.        | Docker, Chromium |

Each run writes `reports/quality/gate-<tier>.json`: every step with its exit code, duration,
log path, and machine-readable artifact. Re-run a single step with
`bun scripts/quality/gate.ts <tier> --only <step>`.

The pre-commit hook is installed by `bun install` and lives in `.githooks/`.

### Proving the gates

`bun run test:gates` applies a deliberately broken input to a disposable copy of the tree,
one per gate, and asserts the gate fails. Every threshold in this repository is therefore
demonstrated rather than asserted. Fixtures are generated at run time, because a stored
fixture for the secret scanner would trip the secret scanner on this repository.

Adding a gate without a fixture is incomplete work: the self-test is what separates a
quality framework from a collection of configuration.

### Blocking versus advisory security

Gitleaks and Semgrep are derived from the code in the repository, so they are reproducible
and they block a merge. Trivy and ZAP depend on external feeds whose results change without
any code change; gating on them would contradict the determinism this repository promises,
so they run on a schedule and open an issue instead.

ZAP runs in a container and reaches the host preview server through the Docker bridge. A
host firewall that blocks the bridge makes every proxied flow time out, and `bun run
nightly` fails with an unreachable target rather than a security verdict. On a host
running `ufw`, allow the bridge first:

```bash
sudo ufw allow in on docker0
```

### Mobile-first end-to-end runs

Fit_ targets Android and iOS browsers, so `bun run test:e2e` defaults to a single mobile
project, `mobile-chrome` (Pixel 7 viewport, Chromium engine). That keeps the everyday loop
fast and makes a mobile viewport the default thing under test.

`bun run test:e2e:all` sets `E2E_ALL_BROWSERS` and adds `mobile-safari` (iPhone 15, the real
WebKit engine iOS uses) plus desktop Chrome and Firefox as a responsive-regression backstop.
CI runs the full matrix.

Generated reports are written under `coverage/`, `playwright-report/`, and `reports/`. They are
ignored by Git and uploaded by GitHub Actions.

## Pull requests

CI runs its gates as parallel jobs, so a formatting failure surfaces in about a minute rather
than behind half an hour of browser and container work. The `main` branch is protected by the
hosted `CI / Quality and security` check, which passes only when every parallel gate succeeds.

Repository-specific agent and review rules live in `AGENTS.md`. `QUALITY.md` is the control
inventory: what each area currently enforces, what to add next, and what should trigger
adding it.

## Deployment

Fit_ ships as a mobile web app, served over HTTP rather than through an app store.
`@sveltejs/adapter-node` is pinned so that `bun run build` proves a deployable artifact.
With `adapter-auto` the build succeeded while adapting to nothing: it exited 0, printed
"Could not detect a supported production environment", and emitted no `build/` directory,
so the build gate proved compilation but never deployability. Swap the adapter if the
hosting target changes.
