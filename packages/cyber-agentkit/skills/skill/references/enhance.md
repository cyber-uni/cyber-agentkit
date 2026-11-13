# Enhance a skill

Suggest what would make a skill that passes `check` better, one suggestion at a time.

## 1. Start

1. Find the skill as [check](check.md) does. If the prompt names evidence that cannot be read, stop and name it.
2. Settle the autonomy level as `SKILL.md`'s Autonomy says.
3. Run `check`. When it fails, run `fix` at the same level first, and stop when `check` still fails.
4. When the prompt asks for a different job from the skill's Intent, change nothing and stop as `SKILL.md`'s Autonomy
   says: the options are to change the Intent, or to `create` a new skill for the new job.

## 2. Gather evidence

The evidence is this session by default, or what the prompt points to: past transcripts, the harness's memory, a
saved `test` result. Read only what the harness already records. Note where each lesson appears: a lesson from use is
offered only once it has happened at least twice across everything read. A saved `test` result counts as one
occurrence of each pattern it shows, such as a criterion that passes in the baseline too. A rubric that failed a result
meeting its criterion, or passed one that does not, is a fault in the evals, not a lesson: offer the rubric change from
a single occurrence. Evidence that points at another skill, or at
no skill, changes nothing; say where it points.

## 3. Suggest

Review the skill against every aspect, core and open, using each aspect's Enhance, the evidence, and the prompt. For
each suggestion give the change, the aspect it touches, the reason, and the evidence it came from. Leave out any change
the skill already has, and any the author declined before for this skill.

- A trigger miss becomes a new trigger case; a wrong result becomes a new outcome case.
- A change to a core aspect reopens every core aspect after it.

## 4. Apply

At `ask`, offer each suggestion on its own; the answer to one decides nothing about the others. Write only accepted
ones. At `apply-safe`, apply a suggestion only when `test` shows no criterion worse than the skill's expected result,
or, with none, the last saved result; when `test` cannot run or is over the test budget, apply nothing and stop. At `apply`, apply
each suggestion that `check` passes after, run `test`, and undo any that leaves a criterion worse. A suggestion that
needs the author's decision stops the run as Autonomy says. Never edit a skill from an installed plugin from evidence of
use: leave the suggestion for the author to send upstream.

After writing, run `check`; it passes, or [fix](fix.md)'s rule for a check that a change broke applies.
When a written change touches the skill's steps, its Criteria, or its evals, run `test` within the test budget as
`SKILL.md`'s Autonomy says. When the result shows no criterion worse than before, offer to keep it as the
skill's expected result with `skill accept <folder>`.

## Report

The autonomy line, and each suggestion with its outcome: applied, with whether `test` showed it safe, declined, or
left for the author with its evidence. With nothing to suggest,
say so and change nothing.
