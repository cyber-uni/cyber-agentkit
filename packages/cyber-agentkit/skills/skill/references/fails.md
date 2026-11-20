# Mark a known failure

Mark a trigger case, or one criterion of an outcome case, as known to fail, with the reason, as `it.fails` marks a test.
The case stays in the suite and stays red, but `test` reports it apart and exits 0, so a known failure no longer drowns
out a new one. List the marks, or clear one once the skill is fixed.

## 1. Find it

Find the skill as [check](check.md) does.

## 2. Take the target and the reason from the author

Mark only when the author asks to and gives the reason: a sentence or a link, such as an issue. When the reason is
missing, ask for it and write nothing. Never add a mark on your own judgment, to make `test` pass or exit 0, or to clear
`check`; a request to make a failing test pass is a request to fix the skill, not to mark it.

The target is an outcome case's ID and the criterion known to fail, such as `mixed-round C3`, or `trigger-<n>` for the
nth trigger case, with no criterion. An outcome case marks only a criterion it tests.

## 3. Run it

```sh
node <this skill's folder>/scripts/cyber-agentkit.mjs skill fails <skill folder>                                  # list every mark
node <this skill's folder>/scripts/cyber-agentkit.mjs skill fails <skill folder> <case> [<criterion>] --reason "<text or link>"
node <this skill's folder>/scripts/cyber-agentkit.mjs skill fails <skill folder> <case> [<criterion>] --clear
```

It writes the case's `fails` in `evals/evals.yaml` and keeps every comment and the layout of the rest. Marking one
already marked replaces its reason. `--clear` with no criterion clears every mark of the case. It refuses, writing
nothing, a mark with no reason and a criterion the case does not test.

## What it changes

- `test` judges a mark at the same threshold as a pass. Below it: `known failure (<reason>)`, apart from passes and
  failures, exit 0. At or above it: `fixed? remove the mark`, with the command that clears it, exit 1.
- A known failure never counts as a pass: a result with one is never saved as the first expected result.
- `check` warns VER-16 with every mark, and fails VER-1 on a mark with no reason or an unknown criterion.
- `report` and the docs page show `known failure (<reason>)`, never a pass rate.

## Report

Say what was marked or cleared, with the reason, and the file written; for a list, each mark with its reason.
