# 0007 — Evals are grouped in scopes, keyed by stable IDs, and stamped with input hashes

**Status:** accepted (2026-11-22). Settles the design of
[cyber-agentkit#364](https://github.com/cyber-uni/cyber-agentkit/issues/364), which subsumes
[cyber-agentkit#363](https://github.com/cyber-uni/cyber-agentkit/issues/363). The design lives in the
[skill-design spec](../../skill-design/README.md) (K10 to K12, A1.9) and its children:
[test](../../skill-design/test/README.md) (UC6.11, UC6.14, UC6.25 to UC6.28, R175 to R185),
[check](../../skill-design/check/README.md) (UC3.9, R186), [create](../../skill-design/create/README.md) (R187),
[update](../../skill-design/update/README.md) (UC29, R188 to R191), [enhance](../../skill-design/enhance/README.md)
(R192), and [fix](../../skill-design/fix/README.md) (R193). Option and question labels below are the ones the Council
answered.

## Problem

A skill's evals were one list with one stored expected result. Any change meant a full run to refresh it, and a run of
some cases could not become the expected result. Trigger cases were named by their place in the list, so adding one
renamed every case after it. The `skill` skill's expected result was 11 cases behind, and the only fix was a full run
of 234 runs, about $18, over the default budget of $5 or 60 runs.

## Decisions

| Question | Chosen | Rejected |
| --- | --- | --- |
| Q1 Trigger IDs | O1: an optional `id`, as outcome cases have; with none, the positional ID stays and `check` warns | O2: a hash of the prompt (a reworded case loses its history); O3: require an `id` now (breaks every list) |
| Q2 Where a part's evals live | O4: an eval folder per part, holding its cases, files, and expected result; trigger cases and shared settings at the root | O5: one list with a tag per case; O6: evals beside the instructions file |
| Q3 What counts as changed | O7: inputs derived from files the skill already has | O8: inputs declared per folder (drift); O9: any change re-runs everything (today) |
| Q4 Shared files and named references | O10: each is an input of exactly the scopes that reach it; a named reference counts as the content a run resolves | O11: anything shared selects every scope; O12: declared per folder |
| Q5 Version | O13: computed hashes, per scope and per case, with O13a to O13d; a format number for the file's shape only | O14: a number the author bumps (forgettable); O15: both |
| Q5 refinement | O16: a scope's inputs follow links transitively | O17: direct links only (misses real changes); O18: a case narrows its own inputs (drift) |
| Q5 refinement | O19: a scope is an eval folder paired with the instructions file of its name; the root is `SKILL.md`'s | Tying scopes to the router table (covers one shape only) |
| Q6 Partial accept | O20: the expected result is one entry per case; accept merges the cases a run finished | O21: accept only a whole scope; O22: keep refusing |
| Q7 Migration | O23: one command that shows a plan and writes on request; carried entries marked "carried by migration" | O24: everything stale after migration (a full run); O25: by hand |
| Q8 The `skill` skill's flows | O26: `create` splits by part when the job has several; `update` runs only stale cases and proposes moving part-specific text out of shared sections; `enhance` suggests splits | O27: `create` always starts as one file |

O13's refinements, from a count of 215 commits on the `skill` skill since 2026-11-08 (built scripts changed in most):

- **O13a.** Built scripts are not inputs. The library's own tests cover what a script does; a script change is
  reported and selects nothing.
- **O13b.** `SKILL.md` is hashed by section: a router row belongs to the scope it links, the description to the trigger
  scope, and only the other sections to every scope.
- **O13c.** Whitespace and line wrapping are not changes.
- **O13d.** The model, harness, and Verification implementation are reported, not selected. The one exception is the
  descriptions of the other skills a run loads, which are inputs of the trigger scope: a sibling skill that claims a
  prompt changes what the trigger cases test.

## Why

- **Stable IDs first.** Every merge, comparison, and known-failure mark keys on a case's ID. A merge by position would
  write one case's result over another's. An authored ID survives rewording; a hash of the prompt does not.
- **Scopes are what the skill does, not a router.** Screaming architecture organizes a skill by what it does, and a
  router with one instructions file per command is one shape of it. A single job split into steps, or one complex
  command split into steps, is another. Pairing a scope with an instructions file covers every shape with one rule,
  and a skill with no split is one scope, exactly today's layout.
- **Hashes, not bumped numbers.** A forgotten bump leaves a result that looks current for a behavior that changed,
  the failure this design removes. The cost of a hash, an edit that changes no behavior, is answered by an explicit,
  visible carry-forward, as an attested pass is shown, never by trusting an author to bump.
- **Derived inputs, followed transitively.** Declared lists go stale exactly when files move, and then an eval reads as
  current when it is not. A command whose instructions reach more files is selected more often; that is honest, and
  the remedy is structural: split it.
- **Merge per case.** It is a snapshot runner's update of only the tests it ran (Jest's `-u` with `-t`), made safe by
  stable IDs. The risk, criteria computed from entries of different runs, is shown by dating each entry and reporting
  the oldest.
- **Migration carries, it does not re-run.** The old expected result was the best evidence before the migration and
  still is after it; marking it carried keeps that visible without paying to establish it again. An entry whose prompt
  no longer matches is left without one, so a result that was already behind reads as stale.
- **Closed world.** A trigger result also depends on the other skills a run loads (the owner's note on closed-world
  testing). They are inputs of the trigger scope, and no other scope.

## Prior art

- Nx and turbo key a task's cache on a hash of its declared inputs, and Nx selects affected tasks from a change. O7
  keeps the hash and derives the inputs instead of declaring them.
- Jest updates the snapshots of only the tests a run selected.
- Stryker's incremental mode reuses stored results keyed by file content.

## Consequences

- With no case named, `test` runs only the stale cases. A full run happens for a change to a section every scope
  reads, or on request.
- `skill accept` and `--accept` no longer refuse a partial result. The refusals `partial-result` and `partial-accept`
  go away; a run cut by the usage limit still writes no entry for a case that has a run at the limit.
- A skill that has not migrated keeps working as one root scope with positional trigger IDs, and `check` warns.
- The word **capability** is not used for a scope, since repobuddy's `project-tracker.capabilities.*` references use
  it for what a system can do. Formalizing that kind of reference is
  [cyber-agentkit#366](https://github.com/cyber-uni/cyber-agentkit/issues/366).
