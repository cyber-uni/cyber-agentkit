# Create a skill

Build a new skill for a job the author describes, one core aspect at a time.

## 1. Place it

1. Ask where the skill goes, unless the author said: the repository's skills folder (`.agents/skills/` when the
   repository has one), a plugin's `skills/`, or the user's own skills folder.
2. Propose a name: lowercase words joined by `-`, naming the job.
3. If `<place>/<name>/SKILL.md` already exists, stop, change nothing, and point to `check`, `fix`, and `enhance`.

## 2. Walk the core aspects

Load the aspects as `SKILL.md` says. For each of Intent, Criteria, Shape, and Trigger, in that order:

1. Draft the aspect as its Draft says, from the description and the aspects approved before it.
2. At `ask` (the default for `create`), show the draft and ask the author to approve it. Write nothing before they
   do. At `apply-safe` or `apply`, write it and report it.
3. Write the approved part into `<place>/<name>/`. A skill stopped partway keeps every approved part on disk.

When the author rejects a draft, redraft that aspect, and reopen every aspect after it that was already approved.

## 3. Build the skill

Write the approved Intent as the opening of `README.md`. Write the steps of `SKILL.md` before `## Done when`: the instructions an agent follows to do the job
and meet each criterion. Follow the approved Shape. Then check the result against the Agent Skills rules in
`SKILL.md`'s Rules.

## 4. Verify

1. Draft the Verification aspect as its Draft says, from the approved Criteria and the Trigger's near misses, and get
   it approved as in step 2.
2. Run [check](check.md), then [test](test.md).
3. When `test` fails, leave the skill in place, report each failing criterion, and offer `fix`.

## Report

The skill's path, each aspect approved, the `check` result, and the `test` result per criterion.
