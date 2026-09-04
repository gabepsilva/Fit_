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
done.

## Gate operation

Every tier runs to completion rather than stopping at the first failure, and writes
`reports/quality/gate-<tier>.json` listing each step, its exit code, its log path and its
machine-readable artifact. `README.md` has the tier table; `make` lists local shortcuts for
the same tiers.

**A gate that did not run is not a gate that failed.** Exit 1 is a verdict about the change;
a runner that died before measuring anything exits 97 instead, and `scripts/quality/run-outcome.ts`
is the one definition of that contract. The gate report files such a step under `crashed`
rather than `failed` and marks its `outcome`, and a tier whose only red steps crashed exits
97 itself. This is reporting, not tolerance: a crash is still red, still blocks, and is never
a threshold to relax. It cost half an hour once, when a mutation lane whose Stryker dry run
died left an empty report directory and exit 1, and was read as surviving mutants.

`make ci` runs the exact steps the CI workflow runs, but arranges them for one machine
instead of separate hosted runners: the static and security jobs run beside the browser
gates, and mutation testing gets the machine to itself afterwards. It cannot be reordered
freely — `build`, `test:e2e` and `test:gates` all contend for `build/` and port 4173, and
`reuseExistingServer` in `playwright.config.ts` means a second Playwright would silently
reuse the first one's server and prove nothing.

**Where a tier runs is a cost decision, and the default is the hosted runners.** Measured
2026-09-04: the hosted `ci` workflow finishes in about nine minutes across ten parallel
jobs, its critical path being the gate self-test at around 316s beside end-to-end at 276s,
while the same suite run locally through `make ci` takes eight to eighteen minutes because
one machine runs the lanes in sequence. Running both is paying twice for one answer, and
the local half is the expensive one: an agent waiting on it is billing tokens to poll a
process that a hosted runner is about to repeat for free.

So the rule is: run `verify:fast` before pushing — it takes about twenty-five seconds and
catches formatting, lint, spelling and typecheck, which is what actually fails most often —
then push and let the hosted matrix run the full tier. Read the verdict from
`gh pr checks`, not from a local report. Two exceptions stay local: the deploy scripts,
which need the real machine, and tight iteration on one failing lane, where
`gate.ts ci --job <name>` beats a nine-minute round trip.

This changes where the gates run, never what they enforce. Every threshold, every lane and
every fixture is unchanged, and a red hosted check blocks a merge exactly as a red local
one did. The trade accepted deliberately is that a mutation or end-to-end failure is caught
after the push rather than before it; since a local full run costs more wall clock than the
hosted one, that costs no time, only the tidiness of never pushing red.

`check:ci-contract` proves every declared local CI slice is hosted and every hosted gate job
is listed in `all-green.needs`; a job outside that protected aggregator is not a merge gate.

`check:schedules` is the same proof for the lanes that deliberately do not gate a merge. A
tier taken off the pull request only exists if a schedule still runs it, so this proves the
`audit` and `nightly` tiers are each invoked by a workflow with a `cron`, and that the
workflow can open an issue when the lane goes red. Deleting a cron line otherwise retires a
whole tier with nothing turning red to say so. The fixtures `unscheduled-audit-lane` and
`silent-scheduled-lane` prove both halves.

`bun run check:thresholds` guards the numbers that decide whether a gate passes: coverage,
mutation score, bundle budgets, duplication, and the suppression baseline. Lowering any of
them fails the gate. The suppression ratchet stops a diagnostic being silenced; this stops
the bar being moved instead.

No tier needs Firefox or WebKit. Every gate runs end-to-end flows through the default
`mobile-chrome` project (Pixel 7 viewport, Chromium engine); only `bun run test:e2e:all`
reaches for `mobile-safari` (iPhone 15, WebKit) and desktop Chrome and Firefox, and CI is
where that runs. Fit_ is a mobile web app, so a mobile viewport is the primary target and
desktop is a regression backstop.

`scripts/security/zap.ts` pins the project it proxies. If a project is renamed in
`playwright.config.ts`, that reference has to move with it or the nightly scan fails with no
matching project. `bun run nightly` also needs the Docker bridge to reach the host preview
server; a host firewall that blocks it produces a timeout, not a security verdict, and must
not be read as a passing scan.

Trivy blocks on High and Critical findings. When the fix sits inside the range the parent
already allows, pin it in the `overrides` block of `package.json` and drop the override once
the tree resolves to a patched version by itself. Do not force an override across a major
boundary a direct dependency declares against; record why here instead.

## Mutation lanes

Pull requests run three lanes, all blocking: the complete Node-only server security closure,
changed Node files, and changed client files. Every one of them judges the diff. The
full-tree compatibility audit is the fourth lane and runs on a schedule instead — see
"Where the full audit runs" below. Test, spec and end-to-end artifacts are never mutation
targets. Untracked production files count as
changes. Security-boundary specs belong exclusively to the always-on security lane; other
changed tests, deleted or renamed inputs, and mutation-configuration changes broaden the
affected lane rather than guessing narrowly.

Security and changed lanes use the **strict verdict**: only an explicit `Killed` result is
positive. Timeouts, uncovered mutants, errors, stale or source-mismatched reports, wrong
scope, omitted executable files, and an empty security scope all fail. A reviewed survivor is
classified as exact equivalence or host-specific defense in depth and bound to an exact
source/location/mutator/replacement fingerprint with a pull-request rationale. It is the sole
changed-line exception, is disclosed separately from the 100 percent observable changed-mutant
score, and is invalidated by source or report drift.

When a configuration, test, deletion, rename, or non-mutated runtime input forces a broad
changed-lane fallback, actual changed production files retain the strict verdict. Unchanged
background files must preserve the historical 80 percent Stryker-compatible aggregate, so
existing legacy debt cannot masquerade as a new regression or make the gate knowingly red.
The verdict records this as `strict-changed-with-legacy-background` and reports both scores.
Scope records Git change status separately from added-line ranges: a production file modified
only by deletions is still strict even though it has no changed-line denominator.

Strict liability is lifted only from a change that is provably inert: it leaves lines in the
new source, Stryker anchored no mutant to any of them, and none of them reach code Stryker
could mutate. The last test is put to the syntax rather than to the mutant count, because
Stryker has no mutator for a renamed call target. The middle one asks where a mutant starts
rather than how far it reaches, because a `BlockStatement` mutant spans every comment in the
body it replaces. A rewritten comment, doc block or reordered import is excused; a deletion, a
rename, and any line Stryker anchored a mutant to are not, and the security lane never is. The
verdict reports the count as `inertFiles` and the lane prints it, so an excused file is
disclosed rather than quietly dropped.

Stryker's own aggregate break stands down on the two changed lanes, which the verdict governs
instead: it is harder than the break on every file it judges, and it holds unchanged fallback
files to the same 80 in their own pool. Leaving the break on would re-impose the whole-file
debt an excused file was just relieved of, from a pool that is often a single file. The break
remains the governing rule for the full-tree lane, and `mutation.break` is unchanged.

A lane that produces no report produced no verdict. It writes `crash.json` where `verdict.json`
would sit, prints the missing artifact, Stryker's exit code and the underlying error, and exits 97. Nothing about that run says a mutant survived, because no mutant was judged; the fixtures
`crashed-mutation-run` and `security-surviving-mutant` prove the same lane reports the two
endings differently. The crash the wording answers to is a worker race in the shared Vite
optimizer cache, which is unfixed and tracked separately.

`bun run test:mutation:full` preserves the pre-existing Stryker-compatible aggregate score and
80 percent threshold while legacy files are remediated. It runs forced-cold once a day on
`main`, and on demand through `workflow_dispatch`, `make audit`, or `bun run audit:mutation`.
Do not describe that legacy lane as killed-only, per-file, or zero-timeout.

Mutation caches are lane-specific and are recorded only after the governing verdict passes.
Never copy an incremental file between lanes or publish one from a failed or cancelled run.
The scheduled audit forces a cold run and shares its cache with nobody, so it can neither
duplicate nor race a pull-request lane.

### Where the full audit runs

Decided 2026-09-04, by the product owner, to cut runner minutes — not wall clock. The
full-tree lane left the pull-request matrix (`ci.yml`) for a daily schedule
(`mutation-audit.yml`, 04:41 UTC on `main`).

The reasoning is what the lane measures. The security and changed lanes judge the code in
the diff, so they have to run on the diff; the full lane re-verifies code the diff never
touched, and its answer changes only when the tree does. Paying for it per push bought a
re-run of yesterday's answer, once per push rather than once per day. Measured on hosted
runners, 2026-09-04: `Mutation (security)` ~34s, `Mutation (changed-node)` ~1m16,
`Mutation (changed-client)` ~8m30, `Mutation (full)` ~17m cold. It was never the critical
path — the self-test at ~316s and end-to-end at ~276s were — so removing it saves runner
minutes and roughly no wall clock.

Nothing about the lane got weaker. `quality/mutation-policy.json` and
`quality/thresholds.json` are untouched, the 80 percent Stryker-compatible aggregate and its
`mutation.break` still govern the full tree, and the schedule runs `--force-cold`, which is
stricter than the incremental run a pull request used to get.

It is not a merge gate, so it has to be loud by itself: the run stays red — no
`continue-on-error` — and a failing run opens, or comments on, one `quality`-labelled issue
carrying the run URL. `check:schedules` proves both the schedule and that issue path still
exist. What this trades away is honest: mutation debt in untouched code is now noticed
within a day rather than on the next pull request that happened to push.
