# Test a skill

Run the skill's evals, as the Verification aspect says. Change no file of the skill.

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

Write the result to `.agents/skill-design/results/<skill name>/latest.json` at the repository root (or under `~/` when
the skill is outside a repository), after moving the previous `latest.json` to `<its at>.json` beside it. Every
Verification implementation writes this shape:

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
    { "prompt": "write release notes", "expect": "fire", "fired": 3, "ran": 3, "status": "pass" }
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
  "notRun": [{ "case": "post-to-github", "reason": "outside effect" }]
}
```

`status` is `pass`, `fail`, `not-tested` (with a `reason`), or `not-run` (with a `reason`). A run that errors or hits a
limit is in `notRun` and never counts as a pass. When the baseline cannot run, `baseline` holds the reason and no
criterion has a `baseline` field.

## Report

Each trigger case beside what was expected; each criterion's pass rate, threshold, and baseline; each failure with its
case and the output that broke it; and the cases that changed between pass and fail since the previous result. With no
previous result, say there is none to compare. In an interactive run with failures, offer `fix`.
