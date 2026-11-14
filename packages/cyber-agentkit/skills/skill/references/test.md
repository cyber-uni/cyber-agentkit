# Test a skill

Run the skill's evals, as the Verification aspect says. Change no file of the skill, except the expected result when
the author asks to accept one, or when the first passing run saves one (see Save the result).

## 1. Find it and its cases

1. Find the skill as [check](check.md) does.
2. If the skill has no `## Done when`, report every outcome as not tested, pointing to `check` and `fix`; trigger
   cases still run.
3. If it has no eval cases, draft them as Verification's Draft says, then stop as `SKILL.md`'s Autonomy says, asking
   to approve them before any run.
4. A criterion with no rubric is reported as not tested, pointing to `fix`.

## 2. Run

Run the cases as Verification's Run says. Pass a judge only when the author named one. A case marked as having an
outside effect is not run, and is reported as such. Each run is contained to its own folder, and reaches the network
only for the hosts its case lists. When the test stops with `error: login:` or `error: sandbox:`, pass the reason on
as it is said; no run was made.

A full test makes many runs and can take several minutes. Before starting, estimate it against the test budget as
`SKILL.md`'s Autonomy says: within it, start without asking; over it, stop. A request that names the runs to make, such
as "run the full test", is the answer for that run. Say how many runs it makes and, from the plan line, about how long
and how much it took last time. When the plan line says an unknown number of
runs, the last result was saved before the run count was recorded and may have covered only some cases: say so. Start it in the background where the harness
can, so the author can keep working, and watch its progress lines on stderr: one per finished run (`[n/total] <case>
run <k> (<arm>): <outcome>`) and a `still running` line when none has finished for 30 seconds. Pass them on at most once
a minute, in one short update that sums up the lines since the last one: the count so far (`n/total`), each run with
the skill that failed or was not run, and the latest `still running` line when no run finished. Send nothing when no
line has come since the last update. A run without the skill that fails is the baseline doing worse, not news. Never
quote the model's replies in an update.

## 3. Save the result

The result goes to `.agents/skill-design/results/<skill name>/latest.json` at the repository root (or under `~/` when
the skill is outside a repository), after the previous `latest.json` moves to `<its at>.json` beside it. The results
folder holds a `.gitignore` containing `*`, so each run's result stays local and out of version control. Each save keeps
`latest.json` and the 5 most recent past results of that skill, and deletes older ones. The result records the skill's
absolute folder as `folder`. Each save also deletes the results folder of any other skill under the same results folder
whose `latest.json` names a `folder` that no longer exists, so throwaway skills leave nothing behind; a results folder
whose `latest.json` has no `folder` or cannot be read is left alone, and nothing outside the results folder, nor any
`evals/expected.json`, is ever deleted. The default Verification's command saves it; another implementation writes the same shape:

```json
{
  "version": 1,
  "skill": "release-notes",
  "folder": "/home/me/code/app/skills/release-notes",
  "at": "2026-11-10T21:00:00Z",
  "verification": "skill-design.aspects.verification from cyber-agentkit",
  "runs": 3,
  "threshold": 2,
  "baseline": "without the skill",
  "trigger": [
    { "case": "trigger-1", "prompt": "write release notes", "expect": "fire", "fired": 3, "ran": 3, "status": "pass" }
  ],
  "criteria": [
    {
      "id": "C2",
      "status": "fail",
      "passed": 1,
      "ran": 3,
      "baseline": { "passed": 0, "ran": 3 },
      "failures": [{ "case": "two-prs", "run": 2, "output": "Merge pull request #12" }]
    }
  ],
  "cases": [
    { "case": "trigger-1", "status": "pass" },
    { "case": "two-prs", "status": "fail" }
  ],
  "notRun": [{ "case": "post-to-github", "reason": "outside effect" }],
  "blocked": [{ "case": "two-prs", "arm": "skill", "run": 1, "what": "network", "target": "api.github.com" }],
  "comparedWith": "expected",
  "changed": [{ "case": "two-prs", "from": "pass", "to": "fail" }],
  "cost": 0.06,
  "durationMs": 252000,
  "totalRuns": 18,
  "replies": "2026-11-10T21-00-00Z.replies.json",
  "evalId": "eval-R14-2026-11-10T21:00:00"
}
```

`status` is `pass`, `fail`, `not-tested` (with a `reason`), or `not-run` (with a `reason`). A run that errors or hits a
limit is in `notRun` and never counts as a pass; its `reason` is one short line, the error without the Agent SDK's
`Error calling Claude Agent SDK: Error: Claude Code returned an error result:` wrapping (for example `Not logged in`). When the baseline cannot run, `baseline` holds the reason and no
criterion has a `baseline` field.

`blocked`, left out when nothing was, lists what a run tried that its containment refused: `what` is `read`, `write`,
or `network`, and `target` the path or host. A refused attempt does not by itself fail a criterion.

`cases` holds each case's status: an outcome case passes when every criterion it tests meets the threshold in it.
`changed` lists the cases that went between `pass` and `fail` since the skill's expected result
(`<skill folder>/evals/expected.json`) when it exists, else since the previous saved result; `comparedWith` says which
(`expected` or `previous`). With neither, `changed` is left out and `noPrevious` is `true`. `cost` is the runs' total in US dollars, when the engine reports it.
`totalRuns` is how many runs the test planned; a result saved before it was recorded lacks it, and its count is unknown.

`replies` names a file beside the result, in the same results folder, that holds the reply of every run, passed,
failed, or not run, with the skill and without it. Each entry has `case`, `arm` (`with-skill` or `baseline`), `run`
(from 1), `outcome` (`pass`, `fail`, `fired`, `not fired`, or `not run`), the whole `reply`, each criterion the run
decided under `criteria` with the `detail` of a failure, and, for a run that did not run, its short `reason` and full
`error`. Read it to see why a run passed or failed; `failures` keeps only the start of a failed reply. The file goes
when its result is pruned. `evalId` is promptfoo's own ID for the run, for `promptfoo view` when its database is kept.
Results saved before these fields were added lack them.

### Accept a result

When the skill has no expected result yet and every case and criterion passes, `skill test` saves that result as the
expected one and its report carries `savedAsExpected: true`: tell the author it was saved. A first run with a fail saves
none. Otherwise only the author's request makes a result the expected result, and nothing else writes into the skill's
folder. `skill test <folder> --accept` runs the test as usual, then writes that result to `<skill folder>/evals/expected.json`,
in the same shape as `latest.json` but without `folder`, `replies`, or `evalId`, since the file is committed and those name
this machine's files. `skill accept <folder>` writes the last saved result there without running the
test, so it spends nothing, and fails with `no-result` when there is none saved. The expected result is kept in version
control with the skill, so the team compares with the same result.

## Report

Each trigger case beside what was expected; each criterion's pass rate, threshold, and baseline; each failure with its
case and the output that broke it; what the runs with the skill tried and were refused, if anything; and the cases that changed between pass and fail since the expected result, or, with
none, the previous result, saying which. With neither, say there is none to compare. Say when the result was saved as the
expected result. With failures, offer `fix` as `SKILL.md`'s Rules say.
