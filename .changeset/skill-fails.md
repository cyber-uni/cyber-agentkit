---
'cyber-agentkit': minor
---

Mark an eval case or criterion as known to fail, as `it.fails` marks a test. A trigger case's `fails` in
`evals/evals.yaml` is the reason; an outcome case's is a mapping of the criteria known to fail, each to its reason. A
mark needs a reason, and an outcome case marks only criteria it tests. `skill test` judges a mark at the same threshold
as a pass: below it, the case or criterion is reported as `known failure (<reason>)`, apart from passes and failures,
and exits 0; at or above it, `fixed? remove the mark` names the command that clears it, and the test exits 1. A result
with a known failure is never saved as the first expected result. The new `skill fails <folder>` lists every mark, and
`skill fails <folder> <case> [<criterion>] --reason "…"` or `--clear` adds, replaces, or clears one, keeping the file's
comments and layout; a trigger case is `trigger-<n>`. `skill check` fails VER-1 on a mark with no reason or an unknown
criterion, and the new warning VER-16 lists every mark. `skill report` and the generated docs page show `known failure
(<reason>)`, never as a pass rate, with a `### Known failures` section. The `skill` skill gains a `fails` command: only
the author marks a known failure, with a reason.
