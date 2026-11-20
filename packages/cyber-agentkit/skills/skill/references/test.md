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

Run the cases as Verification's Run says. Pass a judge only when the author named one. Before the run, list each
criterion whose checks are all `judge`. When the author named no judge, say those criteria will be reported as not
tested and ask which model should judge them (lettered options: name one for `--judge <model>`, run without, or
replace the `judge` with a `regex` or `script` through `fix`); a request that names the runs to make is not an answer, so
run the rest and offer the rerun at the end. After a run without a judge, never read the replies and grade a
not-tested criterion yourself: report it as not tested, and offer `--judge`. Pass `--model` only when the
author named a model or a tier; without it the runs take the harness's mid-tier model. A case marked as having an
outside effect is not run, and is reported as such. Each run is contained to its own folder, and reaches the network
only for the hosts its case lists. When the test stops with `error: login:`, `error: sandbox:`, `error: dependency-missing:`,
`error: dependency-unsupported:`, or `error: plugin-load:`, pass the reason on as it is said; no run was made. For
`dependency-missing`, offer to rerun with `--plugin <folder>` for the plugin it names, or to install that plugin.

A case's setup script and `script` checks run contained, as Verification's Run says. When the test stops with
`error: sandbox:` because this machine cannot run the sandbox, say so, and offer the folder-only sandbox: one test with
`--sandbox folder-only`, or every test with a `skill-design.test.sandbox.meta.md` beside a `skill-design.test.sandbox.yaml` in the repo or user references folder, holding
`extends: [cyber-agentkit/skill-design.test.sandbox.folder-only]` (the YAML holds only the settings it changes), as Verification's Run says. Never pick it on your own: it runs the skill's
shell commands and scripts with no sandbox. When the test stops with `error: sandbox-invalid:` or
`error: sandbox-missing:`, pass the reason on as it is said; no run was made.
When the test warns
`untrusted-scripts:`, the skill is from outside this repository: name each script it lists to the author, and pass
`--trust-scripts` only when the author has read them and says to run them. Never pass it on your own. To add or
remove a case, use `skill case add` and `skill case remove`, never `rm` or a rewrite of a case folder in the shell.

A full test makes many runs and can take several minutes. Before starting, estimate it against the test budget as
`SKILL.md`'s Autonomy says: within it, start without asking; over it, stop. A request that names the runs to make, such
as "run the full test", is the answer for that run. Say how many runs it makes and, from the plan line, about how long
and how much it took last time. When the plan line says an unknown number of
runs, the last result was saved before the run count was recorded and may have covered only some cases: say so. Start it in the background where the harness
can, so the author can keep working, and watch its progress lines on stderr: one per finished run (`[n/total] <case>
run <k> (<arm>): <outcome>`) and a `still running` line when none has finished for 30 seconds. Pass them on at most once
a minute, in one short update that sums up the lines since the last one: the count so far (`n/total`), each run with
the skill that failed, was not run, or was a sandbox failure, and the latest `still running` line when no run finished. When a
`usage limit reached` line comes, pass it on at once with when the limit resets: no new run starts after it, so the
test ends soon, and its last line says how many runs are left. Send nothing when no
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
  "model": "sonnet",
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
    { "case": "trigger-1", "status": "pass", "passed": 3, "ran": 3 },
    { "case": "two-prs", "status": "fail", "passed": 1, "ran": 3 },
    { "case": "fix-flawed", "status": "pass", "passed": 2, "ran": 2, "sandboxFailed": 1 }
  ],
  "notRun": [{ "case": "post-to-github", "reason": "outside effect", "kind": "skipped" }],
  "blocked": [{ "case": "two-prs", "arm": "skill", "run": 1, "what": "network", "target": "api.github.com" }],
  "sandboxFailures": [
    {
      "case": "fix-flawed",
      "arm": "skill",
      "run": 3,
      "fault": "bwrap-read-only-mount",
      "text": "bwrap: Can\u0027t create file at /tmp/skill-test-plugin-x/references/.claude/launch.json: Read-only file system"
    }
  ],
  "comparedWith": "expected",
  "changed": [{ "case": "two-prs", "from": "pass", "to": "fail" }],
  "moved": [
    {
      "case": "two-prs",
      "rates": [
        { "at": "2026-10-01T09:00:00Z", "passed": 3, "ran": 3 },
        { "at": "2026-11-10T21:00:00Z", "passed": 1, "ran": 3 }
      ]
    }
  ],
  "cost": 0.06,
  "durationMs": 252000,
  "totalRuns": 18,
  "replies": "2026-11-10T21-00-00Z.replies.json",
  "evalId": "eval-R14-2026-11-10T21:00:00"
}
```

`status` is `pass`, `fail`, `not-tested` (with a `reason`), or `not-run` (with a `reason`). Each `notRun` entry has a
`kind`. `skipped` is a planned skip: a case the plan left out before running, such as one with an outside effect or one
whose scripts were not trusted to run. `failed` is a harness failure: a run that started and errored, its `case` naming
the run, as `two-prs (with-skill, run 1)`. The text report starts each line with `skipped:` or `failed to run:`. Results
saved before `kind` was recorded lack it; an entry whose `case` names a run is a failure, any other a skip. A run that
errors or hits a limit is in `notRun` and never counts as a pass. A run whose setup script failed is in `notRun` with the reason
`setup script failed: …`, its reply's `error` holds the script's whole output, and it counts toward no pass rate; it
is the case's setup that broke, not the skill, so offer to fix the script, not the skill. A `notRun` reason is one
short line, the error without the Agent SDK's
`Error calling Claude Agent SDK: Error: Claude Code returned an error result:` wrapping (for example `Not logged in`). When the baseline cannot run, `baseline` holds the reason and no
criterion has a `baseline` field.

`sandboxFailures`, left out when there is none, lists each run, in either arm, whose tool output or error carries an
error `skill test` knows the test sandbox caused, such as bwrap's `Can't create file at …` ending in `Read-only file system`: `fault`
names it and `text` is what the run printed. Such a run is a **sandbox failure**: it counts toward no pass rate, and
a case's threshold holds over its other runs. A case's `sandboxFailed`, left out when none was, counts its runs with
the skill that were. A run that broke for a reason `skill test` cannot name is in `notRun` instead.

`incomplete`, left out when every run finished, means the account's usage limit stopped the test: `text` is the
harness's message, `resets` when the limit resets when the message says, and `left` each run (`case`, `arm`, `run`)
the limit ended or never started. Those runs count toward no pass rate, and a case with none of its runs finished is
`not-run`. An incomplete result is never saved as expected, `skill accept` refuses it, and `skill test` exits 1. After
the limit resets, `skill test <folder> --resume` runs only the runs left, with the options the stopped test had, and
saves one result holding both, with `resumedFrom` naming the stopped one. It takes no `--case`, `--model`, `--judge`,
`--baseline`, `--harness`, or `--backend`, and it refuses (`resume-changed`) when the skill or its evals changed since:
then the whole test has to run again. Estimate a resume against the test budget like any test, by the runs left.

`blocked`, left out when nothing was, lists what a run tried that its containment refused: `what` is `read`, `write`,
or `network`, and `target` the path or host. A refused attempt does not by itself fail a criterion.

`sandbox` names the sandbox the runs went without: `none` when neither ran, as the folder-only template has it,
`shell-only` when only shell commands ran in one, and `scripts-only` when only setup scripts and script checks did. It
is left out when both ran. A result whose shell commands had no sandbox carries `wroteOutside`, left out when empty:
each path outside a run's folders that one of its shell commands named and changed, with its `case`, `arm`, and
`run`. When the result has `sandbox`, say which sandbox the runs went without, and name each `wroteOutside` path,
before any pass rate.

`cases` holds each case's status: an outcome case passes when every criterion it tests meets the threshold in it.
A case marked `guard: true` in `evals.yaml` carries `guard: true` and, when the baseline ran, `baseline`: its baseline
runs in which every criterion it tests passed. A criterion that only guard cases test carries `guard: true` too.
`model` names the model the cases ran on (`default` when the harness picked it), and a case that named its own in
`evals.yaml` carries its own `model`. `modelChanged`, left out when none did, lists the cases whose model differs from
the result `changed` compares with, each `from` and `to`; `unknown` is the model of a result saved before it was
recorded.
`passed` and `ran` count its runs that went right: for an outcome case, the runs in which every criterion it tests
passed; for a trigger case, the runs that fired or skipped as expected.
`changed` lists the cases that went between `pass` and `fail` since the skill's expected result
(`<skill folder>/evals/expected.json`) when it exists, else since the previous saved result; `comparedWith` says which
(`expected` or `previous`). With neither, `changed` is left out and `noPrevious` is `true`. `cost` is the runs' total in US dollars, when the engine reports it.
`moved` lists the cases whose pass rate differs between any two of the kept accepted results (see Accept a result)
and this run, each with its rate in each result that holds one, oldest first and this run last; it is left out when no
case moved. A result saved before cases carried counts gives a trigger case's rate from its `trigger` entry, and none
for an outcome case. `totalRuns` is how many runs the test planned; a result saved before it was recorded lacks it, and its count is unknown.

`replies` names a file beside the result, in the same results folder, that holds the reply of every run, passed,
failed, or not run, with the skill and without it. Each entry has `case`, `arm` (`with-skill` or `baseline`), `run`
(from 1), `outcome` (`pass`, `fail`, `fired`, `not fired`, `not run`, `sandbox failure`, or `limit reached`), the whole `reply`, each
criterion the run decided under `criteria` with the `detail` of a failure, for a run that did not run, its short
`reason` and full `error`, and for a sandbox failure, the fault's text as its `reason`. Read it to see why a run passed or failed; `failures` keeps only the start of a failed reply. The file goes
when its result is pruned. `evalId` is promptfoo's own ID for the run, for `promptfoo view` when its database is kept.
Results saved before these fields were added lack them.

### Accept a result

When the skill has no expected result yet and every trigger case and criterion passes, `skill test` saves that result
as the expected one and its report carries `savedAsExpected: true`: tell the author it was saved. A first run with a fail
saves none. Nor does one with no trigger case or criterion, or with any that is `not-run` or `not-tested`: its report
carries `notSavedAsExpected` with the reason, such as `no run finished` or
`not every trigger case and criterion passed: 2 not tested`; tell the author, and offer `skill accept` if they want it
kept anyway; a result whose every case was a planned skip says `every case was skipped before running`. `skill test`
exits 1 on a fail, on an incomplete result, and on a harness failure: a `failed` entry in `notRun`, a sandbox failure
even when the other runs pass, or no run finished though the plan ran some case. A result held for sandbox failures
still reports the pass rates of its finished runs. A planned skip, a `not-tested` criterion, an attested pass, and a known failure exit 0: they never count as
a pass, but they are no failure. A mark the run passed (`fixed?`) exits 1, and a result with a known failure is never
saved as the first expected result. A result with sandbox failures is saved as expected by neither that rule nor `--accept`: the report carries
`expectedHeld: true`, and only `skill accept <folder>`, run after the author has seen it, saves it. Otherwise only the author's request makes a result the expected result, and nothing else writes into the skill's
folder. `skill test <folder> --accept` runs the test as usual, then writes that result to `<skill folder>/evals/expected.json`,
in the same shape as `latest.json` but without `folder`, `replies`, or `evalId`, since the file is committed and those name
this machine's files. `skill accept <folder>` writes the last saved result there without running the
test, so it spends nothing, and fails with `no-result` when there is none saved. The expected result is kept in version
control with the skill, so the team compares with the same result.

Accepting a result moves the expected result it replaces to `<skill folder>/evals/accepted/<its at>.json`, unless it is
the same run, and keeps the 3 newest there, deleting older ones. Commit them with `expected.json`: together they are the
history `moved` compares across. A skill with only `expected.json` needs no step: it is the newest entry, and the
history grows from the next accept.

### A known failure

A case or criterion marked known to fail ([fails](fails.md)) is judged at the same threshold as a pass. Report each
`known failure (<reason>)` apart from the passes and failures, and offer no `fix` for it unless the author asks. On
`fixed? remove the mark`, ask the author whether to clear it, and clear it with `skill fails <folder> <case>
[<criterion>] --clear` only on yes.

### Attest a pass

A criterion or case that passed in the skill's real use, where a link shows it, is recorded with `attest`, not with a
run: follow [attest](attest.md). A `not-tested` entry with a current attestation counts as passed for the first-result
rule above.

## Report

When the result is `incomplete`, say so first: the usage limit stopped it, when it resets, and how many runs are left;
the pass rates below cover only the runs that finished, and it was not saved as expected. Offer `skill test --resume`
for after the reset, and no `fix` for the runs left. When the result has sandbox failures, say so first, before any pass rate: those runs broke in the test sandbox, not
in the skill, and count toward no pass rate. Give each case's `sandboxFailed` beside it. When the result carries
`expectedHeld`, say it was not saved as the expected result because of them, and name `skill accept <folder>` as how
to save it once the author has looked; never run it for them. A sandbox failure is not a failure of the skill: offer
no `fix` for it. Then each
trigger case beside what was expected; each criterion's pass rate, threshold, and baseline; each failure with its
case and the output that broke it; each guard case, whose pass without the skill too is expected, so never report it as a
skill that adds nothing, while a guard that fails with the skill is a failure like any other; what the runs with the
skill tried and were refused, if anything; and the cases that changed between pass and fail since the expected result, or, with
none, the previous result, saying which. With neither, say there is none to compare. Name the model the cases ran on,
and each case on its own. When `modelChanged` lists cases, say their model changed since the result compared with, so
a change there may be the model's rather than the skill's. Name each case in `moved` with
its rate in each accepted result and in this run. Give each `attested` entry with its link, never as a pass rate, and
say when it is stale; ask the author to check a stale one in real use again. Say when the result was
saved as the expected result. With failures, offer `fix` as `SKILL.md`'s Rules say.
