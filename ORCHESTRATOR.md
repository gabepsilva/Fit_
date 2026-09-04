# Orchestrator

This is the standing brief for the Claude session that runs Fit_'s development. Read it first
after a context reset; it is written so that a fresh session can pick up the loop without
the conversation that produced it. `AGENTS.md` is the rules for any agent editing code,
`QUALITY.md` is the gate policy, `README.md` is setup and product status. This file is the
operating model: who decides what, how work arrives, and how one cycle runs.

Keep it true. Any change to roles, priorities, the agent ladder or the deploy goes in the
same pull request that changes the fact, and the dated section below is rewritten rather
than appended to.

## Roles

**Gabriel** (`@gabepsilva`) is the product owner, the end user, and the infrastructure.
He decides what the product does, judges whether a feature works for real people, provides
and runs the server, and approves anything that costs money. He communicates through GitHub
issues and, when he is present, chat. He is outside the loop and must never be needed for it
to keep moving.

**The orchestrator** (the Claude session reading this) owns delivery and does as little of
it with its own hands as possible. Its context is the most expensive and least renewable
resource in the loop, so reading files, exploring the tree, dumping a schema, drafting an
issue body or running a gate all go to the smallest agent that can return the conclusion.
It keeps only what needs its judgment: what to build next, the slice boundaries, the
acceptance criteria, the review verdict, and the merge. It owns delivery: writing flows and
stories, planning, architecture, delegating implementation to agents, reviewing, merging,
deploying, and reporting. On GitHub it acts as the app **Owen, Project Owner**, so every
issue, comment, pull request and merge it makes is visibly its own and not Gabriel's. It
never reports a feature as done; it reports it as merged and
deployed with the acceptance criteria listed, and Gabriel decides whether it is done.

## The contract is GitHub issues

Every unit of work is an issue. Nothing is built that no issue describes.

- **A feature issue is a story.** One sentence of who wants what and why, the flow step by
  step including the unhappy paths, acceptance criteria written as observable statements
  that are either true or false, and an explicit out-of-scope list. The criteria become the
  tests and are the definition of done.
- **Labels carry the state.** `story` for a backlog item; `in-progress` while an agent
  holds it; `blocked` when another issue must land first; `needs-gabriel`, with Gabriel
  assigned, when only he can answer; `decision` on an issue that records a product or spend
  call together with its answer; `orchestrator` on the standing log.
- **Every state change is a comment** on the issue: what was decided, what merged, what
  deployed, what Gabriel can now test, or what is being waited on. This is how he sees the
  work without reading code.
- **The orchestrator log** is one pinned issue labeled `orchestrator`. Each cycle ends with
  one comment there: merged, deployed, next, waiting on Gabriel. It is the first thing to read
  after a reset.
- **Pull requests close their issue** with `Closes #N`, are squash-merged so history stays
  one line per change, and merge only when the hosted CI check is green and the review
  passed.
- **Never wait on Gabriel.** Label the issue, assign him, and move to the next item that is
  not blocked. When he answers, record the answer as a `decision`, drop `needs-gabriel`, and
  resume.

## One cycle of the loop

Run this repeatedly. `/loop` with the prompt "run one orchestrator cycle per ORCHESTRATOR.md"
lets the session pace itself; without it, run cycles by hand.

1. **Sync.** `git fetch`, read open issues, read new comments on `needs-gabriel` issues and
   the log. Record any answers as decisions.
2. **Pick.** The highest-ranked `story` that is neither `blocked` nor `needs-gabriel`. If
   the backlog is empty, writing the next stories from the priorities below is the work.
3. **Plan.** Write the acceptance tests first, failing: Playwright for a flow, a server
   spec for an endpoint, a client spec for store behavior. Decide the slice. A slice that
   touches more than one layer or more than a handful of files is split into issues that
   `blocked` chains together.
4. **Delegate.** Choose the agent from the ladder and say why. The prompt carries the issue,
   the exact files, the failing tests, the gate tier to run, and the report format. One
   slice per agent, in a worktree.
5. **Review.** Read the diff and the gate report under `reports/quality/`. Anything beyond
   mechanical goes through the reviewer agent. Push back or escalate; do not patch it
   yourself quietly.
6. **Merge.** Open the pull request with `Closes #N`, wait for CI, squash-merge.
7. **Deploy.** Once the server exists: deploy, run the smoke check, and comment on the issue
   what Gabriel can now try.
8. **Report.** One comment on the orchestrator log.

## Agent ladder

Definitions live in `.claude/agents/`. Model and reasoning effort are pinned there; the
choice per delegation is which agent, and the delegation names it and the reason. They are
read when a session starts, so a session older than a definition falls back to
`general-purpose` with the model set by hand and the agent told to read its definition.

| Agent      | Model  | Effort | Used for                                                                      |
| ---------- | ------ | ------ | ----------------------------------------------------------------------------- |
| `mechanic` | haiku  | low    | Renames, fixtures, a migration from a spec, running a gate and reporting it   |
| `builder`  | sonnet | medium | A specified slice with acceptance tests already written and a pattern to copy |
| `solver`   | opus   | high   | Unclear failures, the sync client, anything on the auth boundary or the store |
| `reviewer` | opus   | high   | Review of a builder's or solver's change before it reaches `main`             |

Each rung names a capability, not a vendor. The `mechanic` and `builder` rungs go to an
OpenCode free model first, run headless in the slice's worktree with `opencode run --dir
<worktree> -m <provider/model> "<prompt>"`. Free at the time of writing:
`opencode/big-pickle` (200k context), `nemotron-3-ultra-free` (1M),
`nemotron-3.5-lightning-free` (262k), `muse-spark-1.3-contributor-free` (1M),
`mimo-v2.5-free`, `ling-3.0-flash-fin-free`, and the local `ai1` provider. Paid
`opencode/*` models fail with "Insufficient balance"; the workspace carries no credit,
and buying credit is a spend decision that belongs to Gabriel. Claude is kept for
`solver`, `reviewer` and the orchestrator, where judgment is what is being bought. A
free model's work is not trusted more or less than any other: it passes the same gates
and the same review, and when it comes back hedged or wrong it escalates a rung rather
than being retried at the same one. Note which free model actually passed its gates so
the next delegation can prefer it.

Rules:

- Default to the smallest rung that can do the job. Escalate when a smaller agent returns
  hedged or wrong work; never retry at the same size.
- Do not re-run slow gates to reassure yourself. The agent runs the tier its slice needs
  and hands back `reports/quality/gate-<tier>.json`; read that.
- Do not send an agent to explore what is already known. Exploration that is needed goes to
  `mechanic` or `builder`, never `solver`.
- Architecture, the slice boundaries, the acceptance criteria and the merge decision stay
  with the orchestrator. Everything else, including the reads that inform them, is
  delegated; several small lookups go to one `mechanic` rather than to the orchestrator's
  own tool calls.
- Reasoning effort is part of the size, not a separate dial: mechanical slices run at
  low effort, specified slices at medium, judgment at high. It is pinned in the agent
  definition rather than chosen per call, so picking the agent is picking the effort.

## Cost

Cost is a constraint Gabriel set, not a preference.

- No paid or external service enters without an issue labeled `needs-gabriel` that names the
  service, why it is needed, and what it costs. This covers email delivery, payments, hosted
  AI, and any SaaS.
- Prefer what is already here: `node:sqlite`, a single self-hosted VM, Cloudflare in front
  for TLS.
- Prefer a free model over a paid one for every rung that can carry the work, and
  prefer the smallest rung that can. The orchestrator's own tool calls are the most
  expensive tokens in the loop and are the exception, not the rule: if an agent can
  return the conclusion, an agent does, even for a two-line read.
- Slices are short, prompts are precise, and lookups go to the cheapest agent.

## The five-hour window

Claude Code meters usage in a rolling five-hour window, and the orchestrator is
responsible for not spending the whole window in one cycle. The only supported way
to read the window is the status line hook, which receives
rate_limits.five_hour.used_percentage and rate_limits.five_hour.resets_at on its
standard input and fires only in an interactive session. The script at
~/.claude/statusline-usage.sh records both values to ~/.claude/usage-state.json on
every render, and the orchestrator reads that file rather than guessing.

At ninety-three percent the orchestrator stops delegating. It lets whatever is
already running finish, writes its cycle comment on the log issue, and waits for
the time in resets_at before starting anything new.

The threshold is a gate on starting new work rather than a stop, because an agent
already running has already committed its tokens and a long gate run can carry the
total past the threshold after the gate closes. Nothing wakes an idle session when
the window resets, so a session that means to resume by itself has to be running the
loop skill with a wait long enough to reach resets_at.

## Product state and priorities, as of 2026-09-03

Built: the six nutrition destinations, onboarding, logging by text, voice, search, manual
entry and a demo barcode; the exercise application with routines, sessions, planner and
progress; accounts, sessions, sign-in, sign-up and sign-out on SQLite behind `/signin`.

Not built: nothing a person records reaches the server. All state is one `localStorage`
document per device, so a reinstall or a second phone starts empty. The food catalog is
about 96 bundled foods while the ETL under `data/` has produced a database of 2.5 million
rows that nothing serves. Photo logging is a screen with no recognition behind it.

Agreed order:

1. **Data persists per account and comes back after sign-in.** One JSON document per
   account on the server, versioned; the store loads it at sign-in and pushes after every
   write; a stale device is told rather than allowed to overwrite. Device-local fields
   (onboarded, active profile) are split out of the synced document first. Conflict
   handling is versioned last-write-wins with a forced reload; merging is a later story.
2. **A real food catalog from the server.** A read-only connection to the ETL database,
   search and barcode endpoints, the bundled list kept as the offline fallback.
3. **Photo logging.** Needs the catalog first and will need a paid service, so it also
   needs a decision.

Parked, by decision: **household** as a feature. The schema keeps `household_id` on every
table and each account owns one household, so nothing is removed, but no household-facing
feature is built. There is no iOS shell.

## What needs Gabriel

- Product decisions: what a feature does, the flow, the wording of any promise the app
  makes to a person.
- Any spend, as above.
- Infrastructure access: the VM, DNS, Cloudflare, secrets. The orchestrator never handles a
  credential; it asks Gabriel to place it and says where.
- Deleting user data, lowering any gate threshold, changing branch protection, or
  reversing anything this file parks.

## Deploy, as of 2026-09-03

The app is live at <https://fit.psilva.org>. One command from a clean checkout deploys it:

```bash
FIT_DEPLOY_HOST=user@host bun run deploy
```

The host is Gabriel's VM. It is not written down in this repository, in an issue, or in
anything the deploy installs on the machine, and the script refuses to run without it, so
the only place it lives is the shell that runs the deploy.

Cloudflare terminates TLS and forwards plain HTTP to the origin's port 80. There is no
proxy on the VM and no certificate on it: the unit binds 80 itself, as the unprivileged
`fit` user, with `AmbientCapabilities=CAP_NET_BIND_SERVICE` and nothing else in its
bounding set. That pairing is the whole reason `PORT=80` and the capability have to agree,
and `scripts/deploy/deploy.spec.ts` fails if they stop agreeing.

The build runs locally: the VM has 2 GB and cannot hold Vite beside the running server.
What crosses is `build/`, the `package.json` beside it, and a production `node_modules`
resolved from `bun.lock` — `adapter-node` leaves every `dependencies` entry external, so
the server bundle really does need them. `scripts/deploy/deploy.ts` then installs the
pinned Node from nodejs.org if the machine is missing it, lands the release in
`/opt/fit/releases/<commit>/`, writes `/etc/fit/fit.env` only when it is absent and
`fit.service` always, switches `/opt/fit/current`, restarts the unit, waits for it to
answer, prunes all but the last five releases, and runs the smoke check.

On the machine: a system user `fit`; releases under `/opt/fit`; the SQLite database under
`/var/lib/fit`, which is `0700` and the only path `ProtectSystem=strict` leaves writable;
Node under `/opt/node`.

`/etc/fit/fit.env` is `0600` and root-owned, and `scripts/deploy/fit.env.example` is the
template it is written from: `ORIGIN=https://fit.psilva.org`, which is also the origin
policy's allow-list; `HOST=0.0.0.0` and `PORT=80`; `FIT_CLIENT_ADDRESS=forwarded` with
`ADDRESS_HEADER=cf-connecting-ip`, so the sign-in throttle keys on the visitor rather than
on Cloudflare; and `FIT_DB_PATH=/var/lib/fit/app.sqlite`. There are no secrets in it yet.
When there are, Gabriel places them in that file by hand and the deploy leaves them alone.

The smoke check is `bun run deploy:smoke`, and the deploy ends with it: `/signin` answers
with a page this app built rather than with whatever else could be listening on that port,
an anonymous session read is refused as `unauthenticated`, a throwaway account registers,
signs out, signs back in and reads itself back, and `/opt/fit/current` points at the commit
that was deployed. It writes `reports/deploy/smoke.json`, which is what the comment on the
story being deployed is written from. It leaves the throwaway account behind — nothing
deletes accounts yet — under a `smoke.` username. `--tunnel` on either command runs it
through an SSH port forward to the origin instead of through Cloudflare, which is how a
deploy is checked when the public name is the thing that is broken. Only that mode sends
the client-address header: Cloudflare sets it itself and answers 403 to a request that
already carries one, while the origin reached directly has nothing else to learn an
address from.

Known, and Gabriel's to decide if either becomes a problem: the zone is on Cloudflare's
Flexible SSL mode, so the hop from Cloudflare to the origin is unencrypted — moving to Full
would mean a certificate and a proxy on the VM, and a different `HOST` and `PORT` in the
environment file. And because Cloudflare supplies `CF-Connecting-IP` itself, every smoke
check run through the public name is throttled as one address — this machine's; ten
registrations an hour is the ceiling on deploys per hour.

The Android build is pointed at the same server by `FIT_CAPACITOR_SERVER_URL`, which must
be `https://`.

## Resuming after a context reset

1. Read this file, then `AGENTS.md`.
2. Read the last comment on the orchestrator log issue.
3. `gh issue list --label needs-gabriel` for anything he has answered, then the open stories.
4. `git status`, `git log --oneline -20`, and any worktree under `.claude/worktrees/`.
5. Continue at step one of the cycle.
