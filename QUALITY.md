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
