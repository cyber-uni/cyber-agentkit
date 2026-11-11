# Test a skill

Run the skill's evals, as the Verification aspect says. Change no file of the skill, except the expected result when
the author asks to accept one (see Save the result).

## 1. Find it and its cases

1. Find the skill as [check](check.md) does.
2. If the skill has no `## Done when`, report every outcome as not tested, pointing to `check` and `fix`; trigger
   cases still run.
3. If it has no eval cases, draft them as Verification's Draft says and get the author's approval before any run. With
   no author present, run nothing and report the missing cases.
4. A criterion with no rubric is reported as not tested, pointing to `fix`.

## 2. Run

Run the cases as Verification's Run says. Pass a judge only when the author named one. A case marked as having an
outside effect is not run, and is reported as such.

## 3. Save the result

The result goes to `.agents/skill-design/results/<skill name>/latest.json` at the repository root (or under `~/` when
the skill is outside a repository), after the previous `latest.json` moves to `<its at>.json` beside it. The results
folder holds a `.gitignore` containing `*`, so each run's result stays local and out of version control. The default
Verification's command saves it; another implementation writes the same shape:

```json
{
  "version": 1,
  "skill": "release-notes",
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
  "comparedWith": "expected",
  "changed": [{ "case": "two-prs", "from": "pass", "to": "fail" }],
  "cost": 0.06
}
```

`status` is `pass`, `fail`, `not-tested` (with a `reason`), or `not-run` (with a `reason`). A run that errors or hits a
limit is in `notRun` and never counts as a pass. When the baseline cannot run, `baseline` holds the reason and no
criterion has a `baseline` field.

`cases` holds each case's status: an outcome case passes when every criterion it tests meets the threshold in it.
`changed` lists the cases that went between `pass` and `fail` since the skill's expected result
(`<skill folder>/evals/expected.json`) when it exists, else since the previous saved result; `comparedWith` says which
(`expected` or `previous`). With neither, `changed` is left out and `noPrevious` is `true`. `cost` is the runs' total in US dollars, when the engine reports it.

### Accept a result

Only the author's request makes a result the skill's expected result, and nothing else writes into the skill's folder.
`skill test <folder> --accept` runs the test as usual, then writes that result to `<skill folder>/evals/expected.json`,
in the same shape as `latest.json`. `skill accept <folder>` writes the last saved result there without running the
test, so it spends nothing, and fails with `no-result` when there is none saved. The expected result is kept in version
control with the skill, so the team compares with the same result.

## Report

Each trigger case beside what was expected; each criterion's pass rate, threshold, and baseline; each failure with its
case and the output that broke it; and the cases that changed between pass and fail since the expected result, or, with
none, the previous result, saying which. With neither, say there is none to compare. In an interactive run with failures, offer `fix`.
