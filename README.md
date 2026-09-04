# Fit_

[![CI](https://github.com/gabepsilva/Fit_/actions/workflows/ci.yml/badge.svg)](https://github.com/gabepsilva/Fit_/actions/workflows/ci.yml)

A fitness application for Android and iOS, built on SvelteKit. Food logging, an adaptive
calorie and macro model, a household meal plan, and progress tracking, behind a set of
deterministic, reviewable quality gates.

## What's built

The product UI is in: the six nutrition destinations (today, catalog, plan, progress,
exercise, profile), onboarding, the logging flow, and the exercise tab's own eight screens.
It is a port of two design sources — an earlier React prototype for the nutrition side and a
screen-flow prototype for exercise — rebuilt in Svelte 5. Navigation is a side drawer opened
from the top bar, not a bottom bar.

Exercise is its own small application under `/exercise`: the rotation of routines and today's
session, the running session and its summary, the routine sheet and builder with an exercise
library, a month and year planner, and training progress.

The backend is one module deep. `src/lib/server/db.ts` opens SQLite through Node's built-in
`node:sqlite` and owns the migration list; `users/` holds accounts, sessions, passwords and
household membership; `state/` holds one versioned JSON document per household;
`src/hooks.server.ts` resolves the session once per request onto `locals.auth`.
`src/routes/api/` carries registration, sign-in, the two sign-outs and `/api/state`, and
`/signin` and `/signup` are the forms that call them.

**The data belongs to the account, not to the phone.** `state/sync.svelte.ts` reads the
household's document when the session is confirmed and writes it back after every change,
coalesced to one request in flight and one queued. The server stores the document opaquely
and versions it; a device that pushes from a stale version is refused with the current
document, adopts it, and says so. `localStorage` is still where the store lives moment to
moment, so the app works with no network and sends what is waiting when one returns — and a
device that has a journal the server has never seen pushes it rather than being emptied by
it. Signing out clears both the document and the sync record from the device, after asking
if anything is still unsent. Merging two devices that edited while apart is not built:
the later version wins and the device that was behind is told.

Signing in is nevertheless how the app opens. `AppShell.svelte` sends anyone without a session
to `/signin`, carrying `?next=` for the page they asked for, and renders nothing while it goes
— a shell drawn first and replaced afterwards would show the journal it is meant to withhold.
`/signin` and `/signup` are the only destinations reachable without a session, listed in
`components/auth/auth-routes.ts`; onboarding is inside the gate like everything else, so the
account comes first on a new device. That gate decides what this device draws and nothing
more — it is not an authorization boundary, because `ssr` is off for both targets and the
Capacitor build is static, so there is no server render to refuse with.

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

## Running it

In production the app is the `adapter-node` build, deployed to one small Linux VM with
Cloudflare terminating TLS in front of it.

```bash
FIT_DEPLOY_HOST=user@host bun run deploy
```

`scripts/deploy/deploy.ts` builds here rather than there — the VM has 2 GB and cannot hold
Vite beside the running server — then ships `build/`, the `package.json` beside it, and a
production `node_modules` resolved from `bun.lock`. It installs the Node pinned in
`.tool-versions` from nodejs.org if the machine does not already have it, lands the release
in `/opt/fit/releases/<commit>/`, switches `/opt/fit/current`, restarts `fit.service`, and
runs the smoke check. The tree must be clean: a release is named for its commit.

The host is deliberately not in this repository. Without `FIT_DEPLOY_HOST` the script stops.

On the machine, all of it installed by the deploy:

| Path                      | What                                                                 |
| ------------------------- | -------------------------------------------------------------------- |
| `/opt/node`               | The pinned Node, from nodejs.org against its own checksums           |
| `/opt/fit/releases/<sha>` | One release; the last five are kept and hard-link their shared parts |
| `/opt/fit/current`        | Symlink to the live release. Switching it is the deploy              |
| `/etc/fit/fit.env`        | `0600`, root-owned, read by the unit's `EnvironmentFile`             |
| `/var/lib/fit/app.sqlite` | The database, in a `0700` directory owned by the `fit` user          |

`scripts/deploy/fit.service` runs as the unprivileged `fit` user under `ProtectSystem=strict`
with `/var/lib/fit` as its only writable path, and holds `CAP_NET_BIND_SERVICE` so it can
bind port 80 without being root — Cloudflare terminates TLS and forwards plain HTTP there,
so there is no proxy on the machine. `scripts/deploy/deploy.spec.ts` holds that unit and
that environment file to each other, so the port and the capability cannot drift apart. `scripts/deploy/fit.env.example` is the template for the
environment file, and documents what each variable does: `ORIGIN`, which is also the origin
policy's allow-list; `FIT_CLIENT_ADDRESS=forwarded` with `ADDRESS_HEADER=cf-connecting-ip`,
so the sign-in throttle keys on the visitor rather than on Cloudflare; `FIT_DB_PATH`; and
`FIT_CATALOG_PATH`, the read-only food catalog the ETL builds, which is shipped to the
machine separately and which the app starts and serves without.
The deploy writes that file only when it is absent, so an edit on the machine survives the
next release.

```bash
bun run deploy:smoke
```

The smoke check asks the deployed server for the sign-in page and requires a page this app
built, not merely a 200 — a 200 is what anything listening on that port would answer. It
then checks that an anonymous `GET /api/sessions/current` is refused as `unauthenticated`,
registers a throwaway account and signs it out, in and out again, and confirms
`/opt/fit/current` points at the commit under test. It writes `reports/deploy/smoke.json`.
Add `--tunnel` to either command to reach the origin through an SSH port forward instead of
through Cloudflare, for when the public name is the thing that is broken; that mode also
stands in for the proxy's client-address header, which Cloudflare otherwise supplies and
refuses to accept from a caller.

## Quality gates

Checks are tiered by how long they take, so the loop you run most often stays short.
Every tier runs to completion and aggregates its results, rather than stopping at the
first failure and making you pay another round trip per error.

| Command                  | Purpose                                                            | Requires         |
| ------------------------ | ------------------------------------------------------------------ | ---------------- |
| `bun run precommit`      | Formatting, lint, suppression ratchet. Fail-fast.                  | Nothing          |
| `bun run verify:fast`    | Every static check plus server unit tests.                         | Nothing          |
| `bun run verify`         | Adds workflow lint, coverage, build, bundle budgets.               | Docker, Chromium |
| `bun run verify:deep`    | Adds mutation testing and end-to-end flows.                        | Docker, browsers |
| `bun run ci`             | Adds Gitleaks and Semgrep. The merge gate.                         | Docker, browsers |
| `bun run audit:mutation` | The three mutation lanes CI runs daily. Reports debt, never gates. | Chromium         |
| `bun run nightly`        | Trivy and ZAP. Scheduled, never a merge gate.                      | Docker, Chromium |

Each run writes `reports/quality/gate-<tier>.json`: every step with its exit code, duration,
log path, and machine-readable artifact. Re-run a single step with
`bun scripts/quality/gate.ts <tier> --only <step>`.

A red step is one of two things, and the report keeps them apart. `failed` lists steps that
ran and judged the change; `crashed` lists steps that died before reaching a verdict, and
each step carries an `outcome` of `passed`, `failed` or `crashed`. A crashed step proves
nothing about the change, so it is never a finding to work around.

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

ZAP runs in a container and reaches the host preview server through the Docker bridge.

### Mobile-first end-to-end runs

Fit_ targets Android and iOS browsers, so `bun run test:e2e` defaults to a single mobile
project, `mobile-chrome` (Pixel 7 viewport, Chromium engine). That keeps the everyday loop
fast and makes a mobile viewport the default thing under test.

`bun run test:e2e:all` sets `E2E_ALL_BROWSERS` and adds `mobile-safari` (iPhone 15, the real
WebKit engine iOS uses) plus desktop Chrome and Firefox as a responsive-regression backstop.
CI runs the full matrix, one hosted job per project, selected with `E2E_PROJECT`; the list
those jobs must cover lives in `scripts/quality/e2e-projects.ts`.

Each Playwright worker gets its own preview server, on its own port, over its own SQLite
file (`tests/preview-server.ts`). Nothing is shared between workers — not the accounts, not
the registration throttle — so the suite runs in parallel rather than one test at a time.

### Search relevance

Ranking is judged by measurement rather than by argument. `data/eval/search-queries.json`
holds forty queries in three groups — ones the ranking answers badly, ones it answers well
and must keep answering well, and ones that ask for offal on purpose and must still find it
— each with the names a person means and the names that must not reach the top five.

```bash
FIT_CATALOG_PATH=… bun run search:eval -- --label before
FIT_CATALOG_PATH=… bun run search:eval -- --label after --baseline reports/eval/search-before.json
```

It reports precision@3, mean reciprocal rank, forbidden names in the top five, and cold and
warm latency, and writes `reports/eval/search-<label>.json`. It is deliberately not a gate:
it needs the 1.4 GB catalog, which is neither in the repository nor in CI, and its verdict
is a judgement about food rather than a threshold. Run it either side of a ranking change
and put the table in the pull request.

Generated reports are written under `coverage/`, `playwright-report/`, and `reports/`. They are
ignored by Git and uploaded by GitHub Actions.

## Pull requests

CI runs its gates as parallel jobs, so a formatting failure surfaces in about a minute rather
than behind half an hour of browser and container work. The `main` branch is protected by the
hosted `CI / Quality and security` check, which passes only when every parallel gate succeeds.

Repository-specific agent and review rules live in `AGENTS.md`. `QUALITY.md` is the control
inventory: what each area currently enforces, what is deliberately absent, and the gate and
mutation-lane policy behind the numbers.
