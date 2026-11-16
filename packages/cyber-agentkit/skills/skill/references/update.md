# Update a skill

Change an existing skill for a reason the author or the work in hand names, such as a request, an issue, or a bug,
then prove the change with `check` and `test`. It is the path for work that edits a skill's `SKILL.md`, or a file under
its `references/`, `scripts/`, `assets/`, or `evals/`, or a reference the skill loads. A new skill goes through
[create](create.md); a repair of failures `check` or `test` already found goes through [fix](fix.md).

## 1. Start

1. Find the skill as [check](check.md) does.
2. Settle the autonomy level as `SKILL.md`'s Autonomy says. Write the `Autonomy:` line now, and again as the first line
   of the reply that ends the run, even when the run stops before any change.
3. If the skill came from an installed plugin, say before the first edit that a plugin update will overwrite it.
4. When the change asks for a different job from the skill's Intent, change nothing and stop as `SKILL.md`'s Autonomy
   says: the options are to change the Intent, or to `create` a new skill for the new job.

## 2. Change it

1. Make the change the work names, and nothing else. At `ask`, propose it and stop for the answer first.
2. When the change adds or alters a behavior, add a trigger or outcome case for it with `skill case add`, and a
   criterion under `## Done when` with a rubric when the result changes. Removing or weakening a criterion is the
   author's decision: stop as `SKILL.md`'s Autonomy says.
3. When a built or generated file depends on what was edited (a compiled script, a generated manifest), rebuild it as
   the repository's instructions say.

## 3. Check, then test

1. Run [check](check.md). Follow [fix](fix.md) for each failure it finds, at the same level, and stop when `check` still
   fails.
2. Estimate `test` against the test budget as `SKILL.md`'s Autonomy says, and write the `Test budget:` line. Within the
   budget, run [test](test.md) without asking. Over it, stop as Stops says, and keep the change.
3. Follow [fix](fix.md) for each failure `test` finds. A criterion worse than before is reported, not hidden.

## Report

The autonomy line, then what changed and why, each case or criterion added, and each decision made on the author's
behalf. End with the final `check` result (each failing ID with its severity) and the `test` result per criterion and per
trigger case. When `test` did not run, give the `Test budget:` line or the reason it could not. Show these even when
every check passed.
