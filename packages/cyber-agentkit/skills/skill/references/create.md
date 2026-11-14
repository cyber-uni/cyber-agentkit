# Create a skill

Build a new skill for a job the author describes, one core aspect at a time, then check and test it. Do the work
through to `test` without stopping at each aspect: stop only as `SKILL.md`'s Autonomy says, for a decision only the
author can make (such as Intent's job read two ways), and for a `test` over the test budget. Where an aspect's Draft says to show or propose a draft to the
author, that applies at `ask`; at `apply` or `apply-safe`, the report shows it instead.

## 1. Place it

1. Settle the autonomy level as `SKILL.md`'s Autonomy says.
2. Put the skill where the author said: the repository's skills folder, a plugin's `skills/`, or the user's own skills
   folder. When they said nowhere, use the repository's skills folder (`.agents/skills/` when the repository has one),
   or the user's own skills folder when the request is outside a repository.
3. Name it in lowercase words joined by `-`, naming the job.
4. If `<place>/<name>/SKILL.md` already exists, stop, change nothing, and point to `check`, `fix`, and `enhance`.

## 2. Walk the core aspects

Load the aspects as `SKILL.md` says. For each of Intent, Criteria, Shape, and Trigger, in that order:

1. Draft the aspect as its Draft says, from the description and the aspects written before it.
2. At `apply` or `apply-safe`, write it and go on to the next aspect; the report lists each
   draft. At `ask`, or when the author asked to approve each part, show the draft and ask the author to approve it,
   and write nothing before they do.
3. Write the part into `<place>/<name>/`. A skill stopped partway keeps every written part on disk.

When the author rejects a draft, redraft that aspect, and reopen every aspect after it that was already written.

## 3. Build the skill

Write the Intent as the opening of `README.md`. Write the Criteria as `## Done when`, the last
section of `SKILL.md`; every skill has one, even a skill only another skill loads. Write the steps of `SKILL.md` before
it: the instructions an agent follows to do the job and meet each criterion. Follow the Shape.

## 4. Verify

1. Draft the Verification aspect as its Draft says, from the written Criteria and the Trigger's near misses, and
   write it as in step 2.
2. Run [check](check.md) on the skill, deciding every `read` check yourself, without stopping to ask. When it finds
   a failure, repair it as [fix](fix.md) does at `create`'s level, and run `check` again.
3. Estimate `test` against the test budget as `SKILL.md`'s Autonomy says. Within it, carry on into [test](test.md)
   without asking. Over it, stop as Autonomy's Stops says, with the skill kept on disk; when the answer declines the
   runs, report `test` as not run.
4. When `test` fails, or `check` still fails, leave the skill in place, report each failing check or criterion, and
   offer `fix`.

## Report

The autonomy line, the skill's path, each aspect as written, each decision made on the author's behalf, the `check`
result, the `Test budget:` line, and the `test` result per criterion, or that `test` was not run and why.
