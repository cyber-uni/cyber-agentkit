# Test a skill

Run the skill's evals, as the Verification aspect says. Change no file of the skill, except the expected result when
the author asks to accept a result, or when a case with no entry passes and its entry is saved (see Accept a result).

## 1. Find it and its cases

1. Find the skill as [check](check.md) does.
2. If the skill has no `## Done when`, report every outcome as not tested, pointing to `check` and `fix`; trigger
   cases still run.
3. If it has no eval cases, draft them as Verification's Draft says, then stop as `SKILL.md`'s Autonomy says, asking
   to approve them before any run.
4. A criterion with no rubric is reported as not tested, pointing to `fix`.

## 2. Run

Run the cases as Verification's Run says. Without `--judge`, `judge` checks are graded on the harness the runs
drive, by its mid-tier model, and the result names the judge. Pass `--judge <model>` only when the author named a judge, such as a stronger
one, and `--no-judge` only when the author asks to run without one; then the criteria whose checks are all `judge` are
reported as not tested. After a run without a judge, never read the replies and grade a not-tested criterion yourself:
report it as not tested, and offer a rerun without `--no-judge`. Pass `--model` only when the
author named a model or a tier; without it the runs take the harness's mid-tier model. A case marked as having an
outside effect is not run, and is reported as such. Each run is contained to its own folder, and reaches the network
only for the hosts its case lists. When the test stops with `error: login:`, `error: sandbox:`, `error: dependency-missing:`,
`error: dependency-unsupported:`, or `error: plugin-load:`, pass the reason on as it is said; no run was made. For
`dependency-missing`, offer to rerun with `--plugin <folder>` for the plugin it names, or to install that plugin.

A case's setup script and `script` checks run contained, as Verification's Run says. When the test stops with
`error: sandbox:` because this machine cannot run the sandbox, say so, and offer the folder-only sandbox: one test with
`--sandbox folder-only`, or every test with a `skill-design.test.sandbox.meta.md` beside a `skill-design.test.sandbox.yaml` in the repo or user references folder, holding
`extends: [cyber-agentkit/skill-design.test.sandbox.folder-only]` (the YAML holds only the settings it changes), as Verification's Run says. Never pick it on your own: it runs the skill's
shell commands and scripts with no sandbox. The choice is the author's, so end as a stop does, with the question and
its options, each lettered. When the test stops with `error: sandbox-invalid:` or
`error: sandbox-missing:`, pass the reason on as it is said; no run was made.
When the test warns
`untrusted-scripts:`, the skill is from outside this repository: name each script it lists to the author, and pass
`--trust-scripts` only when the author has read them and says to run them. Never pass it on your own. To add or
remove a case, use `skill case add` (with `--expect fire` or `skip` for a trigger case, or `--scope <part>` for an outcome case of a part with an eval folder) and `skill case remove`, never `rm` or a rewrite of a case folder in the shell.

Without `--case`, `test` runs only the stale cases, as Verification's Run says: those with no expected entry, or whose
definition or scope inputs changed since their entry. Pass `--all` only when the author asks for every case, such as
"run the full test". When every case is current, nothing runs: the reply carries `"ran": 0` and `selected`, and you
tell the author no case changed. The estimate counts only the selected runs.

A full test makes many runs and can take several minutes. Before starting, and before any `test` run, whichever command starts it, estimate it against the test budget. Load
`skill-design.autonomy` with the `reference` skill of `cyber-agentkit`: its `test budget` section sets the budget. Run

```sh
node <this skill's folder>/scripts/cyber-agentkit.mjs skill test <skill folder> --estimate --format json
```

It makes no run, reads that budget, and prints `within`, `last`, and `line`. Write `line` on a line of its own, exactly
as printed, prefix included. Within the budget, start without asking; over it, stop as `SKILL.md`'s Stops says. A request that names the runs to make, such
as "run the full test" (`--all`), is the answer for that run. Say how many runs it makes and, from the plan line, about how long
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
  "judge": "sonnet",
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

`judge` names the model that graded the `judge` checks, or `default` when the harness picked it; it is left out when none ran: the test ran with `--no-judge`,
or no case that ran has one. `status` is `pass`, `fail`, `not-tested` (with a `reason`), or `not-run` (with a `reason`). Each `notRun` entry has a
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
`not-run`. No case with a run at the limit gets an expected entry, saved or accepted; the cases that finished can, and
`skill test` exits 1. After
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

`selected`, set when no `--case` or `--all` was given, says why each case ran: `stale` lists the cases, `scopes` gives
each scope with a stale case, its `cases`, and why (`inputsChanged` names each input that changed, such as
`references/check.md`; `caseChanged` the cases whose own definition changed; `noEntry` those with no entry;
`unrecorded` those whose entry recorded no inputs to compare), `current` counts the cases that did not run, and
`notSelecting` lists a change that selects no case, such as `built scripts changed`. A run of some stale cases is also
`partial`.

`replies` names a file beside the result, in the same results folder, that holds the reply of every run, passed,
failed, or not run, with the skill and without it. Each entry has `case`, `arm` (`with-skill` or `baseline`), `run`
(from 1), `outcome` (`pass`, `fail`, `fired`, `not fired`, `not run`, `sandbox failure`, or `limit reached`), the whole `reply`, each
criterion the run decided under `criteria` with the `detail` of a failure, for a run that did not run, its short
`reason` and full `error`, and for a sandbox failure, the fault's text as its `reason`. Read it to see why a run passed or failed; `failures` keeps only the start of a failed reply. The file goes
when its result is pruned. `evalId` is promptfoo's own ID for the run, for `promptfoo view` when its database is kept.
Results saved before these fields were added lack them.

### Accept a result

The expected result is kept per scope: `<skill folder>/evals/<name>/expected.json` for the cases of an eval folder,
and `<skill folder>/evals/expected.json` for the trigger and root cases, which also holds the attested passes. Each
holds one entry per case, keyed by its ID, under `entries`.
A run is stopped when its cost passes a cap: the `costCap` (US dollars) the case names in its `evals.yaml` entry, else
twice the `max` its entry recorded, and never below $0.50, which a case with no recorded `cost` takes. A stopped run
errors with `Exceeded the run cost cap`, is reported as not run, and counts the cost it reached into the next cap. Say
so when a case's runs stopped at the cap, and name its `costCap` as the way to give it more room. The estimate sums each
planned case's recorded cost; a run with no recorded cost takes the last result's average price.
Each entry records the case's `status`, `passed`, and `ran`, for an outcome case each criterion it tests under
`criteria`, the `model`, its runs' `cost` per arm (`skill` and `baseline`, each with `runs`, `total`, and the dearest run's
`max`, in US dollars), when it was recorded (`at`), and `hashes` of the case's own definition and of its scope's
inputs. `scope` is `trigger` for a trigger case, the eval folder's name for a case in `evals/<name>/`, and `root` for
another outcome case. `inputs` keeps each recorded scope's inputs by name, so a later run names the one that changed. A criterion's expected result is
computed from the entries of the cases that test it; when they were recorded at different times, it carries
`recorded`, the oldest. The file never carries `folder`, `replies`, or `evalId`, since it is committed and those name
this machine's files. A file in the older form, one saved result with no `entries`, is still read as it is, and the
next write turns it into entries. A single `evals/expected.json` holding every scope's entries is read too, and the next
write splits it per scope.

A case with no entry whose runs pass gets its entry without an accept: the report's `expectedWritten` is
`{ "by": "pass", "cases": [...] }`, and you tell the author which were saved. A case with an entry keeps it until the
author accepts a new one. A case that ran with no entry and did not pass gets none: `notSavedAsExpected` lists each
with why, such as `it failed`, `it was not run: <reason>`, `it tests no criterion with a rubric`, `it is known to fail`,
or `its known-failure mark is out of date; clear it first`. Tell the author, and offer `skill accept` if they want it
kept anyway. A case whose runs had sandbox failures is saved by neither that rule nor `--accept`: `expectedHeld` lists
it, and only `skill accept <folder>`, run after the author has seen it, saves it.

`skill test <folder> --accept` runs the test as usual, then writes the entry of each case it finished; `expectedWritten`
then says `"by": "accept"`. `skill accept <folder>` does the same with the last saved result without running the test,
so it spends nothing, and fails with `no-result` when there is none saved, or `nothing-finished` when it finished no
case. Either way, every other entry stays as it was, so a run of some cases (`--case`), or one the usage limit stopped,
writes the entries of the cases it finished only, and an entry of a case the evals no longer hold is dropped. Nothing
else writes into the skill's folder. The expected result is kept in version control with the skill, so the team
compares with the same result.

`skill test` exits 1 on a fail, on an incomplete result, and on a harness failure: a `failed` entry in `notRun`, a
sandbox failure even when the other runs pass, or no run finished though the plan ran some case. A result held for
sandbox failures still reports the pass rates of its finished runs. A planned skip, a `not-tested` criterion, an
attested pass, and a known failure exit 0: they never count as a pass, but they are no failure. A mark the run passed
(`fixed?`) exits 1.

When a change alters no behavior, such as a typo fix, the author can carry entries forward to the current inputs
instead of running them: `skill carry <folder> --scope <scope> --reason "<why>"`, with `trigger`, `root`, or an eval
folder's name, or `--case <id>` (repeatable)
for named cases. Each entry carried takes the hashes as they are now and `carried` with the reason and when; its result
and `at` stay. Carry only on the author's request, with their reason. A later `test` lists each carried entry it
compared with under `comparedCarried`; say it was carried forward, never a pass from a run.

When an accept replaces or drops an entry, the file of the scope it changes moves to that scope's
`accepted/<its at>.json` beside it first (`evals/accepted/` for the trigger and root cases), unless it is the same run,
and the 3 newest stay there. Commit them with the expected results: together they are the history `moved` compares across. A skill with only `expected.json`
needs no step: it is the newest entry, and the history grows from the next accept.

### Migrate to scopes

When the author asks to move a skill's evals into scopes, or to stop a single-list skill's `test` from running every
case, run `skill migrate <folder>` without `--write` first, and show the author its plan: the ID each trigger case gets
(`triggerIds`), the cases each eval folder takes (`moves`) and those that stay at the root (`stay`), and, per scope,
the entries carried, those already behind, and the cases with no entry (`expected`). Offer to change an ID with
`--id <from>=<id>`. Write it with `--write` only on the author's request. A carried entry reads `carried by migration`
with the date it was recorded: say so, never that it passed in a run. The next `test` runs only the cases with no entry
or already behind. `"nothing": true` means the evals are already in scopes.

### A known failure

A case or criterion marked known to fail ([fails](fails.md)) is judged at the same threshold as a pass. Report each
`known failure (<reason>)` apart from the passes and failures, and offer no `fix` for it unless the author asks. On
`fixed? remove the mark`, ask the author whether to clear it, and clear it with `skill fails <folder> <case>
[<criterion>] --clear` only on yes.

### Attest a pass

A criterion or case that passed in the skill's real use, where a link shows it, is recorded with `attest`, not with a
run: follow [attest](attest.md). An attested pass is shown beside the run's result; it saves no entry.

## Report

When the result is `incomplete`, say so first: the usage limit stopped it, when it resets, and how many runs are left;
the pass rates below cover only the runs that finished, and no case with a run at the limit got an entry. Offer `skill test --resume`
for after the reset, and no `fix` for the runs left. When the result has sandbox failures, say so first, before any pass rate: those runs broke in the test sandbox, not
in the skill, and count toward no pass rate. Give each case's `sandboxFailed` beside it. When the result carries
`expectedHeld`, say those cases got no entry because of them, and name `skill accept <folder>` as how
to save it once the author has looked; never run it for them. A sandbox failure is not a failure of the skill: offer
no `fix` for it. Then each
trigger case beside what was expected; each criterion's pass rate, threshold, and baseline; each failure with its
case and the output that broke it; each guard case, whose pass without the skill too is expected, so never report it as a
skill that adds nothing, while a guard that fails with the skill is a failure like any other; what the runs with the
skill tried and were refused, if anything; when `selected` left cases out, each scope that ran with the input that
changed, how many cases were current, and each `notSelecting` change; and the cases that changed between pass and fail since the expected result, or, with
none, the previous result, saying which. With neither, say there is none to compare. Name the model the cases ran on,
and each case on its own. When `modelChanged` lists cases, say their model changed since the result compared with, so
a change there may be the model's rather than the skill's. Name each case in `moved` with
its rate in each accepted result and in this run. Give each `attested` entry with its link, never as a pass rate, and
say when it is stale; ask the author to check a stale one in real use again. Say which entries `expectedWritten` wrote and
whether by an accept or a first pass, which cases `notSavedAsExpected` left without one and why, and each entry in
`comparedCarried` as carried forward, not run. With failures, offer `fix` as `SKILL.md`'s Rules say.
