---
spec-type: behavioral
status: draft
---

# skill-design/test — an author knows whether a skill fires on the right requests and gives a result that meets its Criteria

Part of [skill-design](../README.md). Its What, non-goals, key terms, actors, every-command criteria, and aspect
contract apply here; IDs are shared across the parent and its children.

## Use cases

### UC6 — Test a skill by running it (A1.6)

- **Trigger:** the author wants to know whether the skill fires on the requests it should and not on near misses, and
  whether running it gives a result that meets its Criteria, for example after a change or before sharing it.
- **Entry points:** skill (primary): `/skill test [skill]`. `create` also runs it as its last step (UC1).
- **Inputs:** the skill; its Criteria, each with a rubric; its eval cases, meaning requests that should and should not
  trigger it and sample inputs for outcome runs; the baseline, a run without the skill by default or a previous
  version; the selected implementation for each aspect, where Verification's implementation decides how cases are run
  and judged; optionally, a judge.
- **Success:** each trigger case reports whether the skill fired, against what was expected. Each case runs several
  times, isolated from the other runs and from the author's environment. Each run passes or fails each criterion's
  rubric; each criterion reports its pass rate and passes when the rate meets the threshold Verification's
  implementation sets. Each criterion's result is shown beside the baseline's, and the cases that changed between pass
  and fail since the skill's expected result are listed. Each fail names the case and the output that broke it. The result is saved in
  one shape that every Verification implementation writes, where `fix`, `enhance`, and the next `test` read it. The
  skill is unchanged. In an interactive run with failures, it ends by offering `fix`. While it runs, the author sees
  how many runs it will make, each run as it ends, and a sign it is still working when no run has ended for a while,
  so a long test never looks stuck.
- **Extensions:**
  - **UC6.1** The skill cannot be found. `/skill` stops and names what it looked for.
  - **UC6.2** The skill has no Criteria. Outcomes are reported as not tested, pointing to `check` and `fix`; trigger
    cases still run.
  - **UC6.3** The skill has no eval cases. `/skill` proposes cases from the Intent and Criteria, and the author approves
    them before any run. With no author present, nothing is tested and the missing cases are reported.
  - **UC6.4** A run errors or hits a limit, such as time or token budget. That case is reported as not run, with the
    reason, and never as a pass.
  - **UC6.5** A case gives different results on different runs. That is expected: the pass rate over the runs is the
    result.
  - **UC6.6** The selected implementation for an aspect cannot be found. The default is used, as in UC1.3.
  - **UC6.7** A criterion has no rubric. That criterion is reported as not tested, pointing to `fix`.
  - **UC6.8** A case would cause an outside effect the run cannot contain, such as posting to GitHub. It is not run, and
    is reported as such.
  - **UC6.9** There is no earlier result. The list of changed cases is left out, and the report says so.
  - **UC6.10** The baseline cannot be run, for example because the previous version cannot be found. Results are
    reported without it, and the report says so.
  - **UC6.11** The author accepts a result. It becomes the skill's expected result, kept with the skill and shared
    through version control, while each run's own result stays local to the author's copy.
  - **UC6.12** The skill has no expected result yet, and every case and criterion passes. The result becomes the
    expected result, and the report says so. A first run with a fail saves no expected result.
  - **UC6.13** The skill is part of a plugin the author is developing in the working copy. Each run loads that plugin
    from the working copy, with its references and its other skills, as an install of it would; the baseline loads
    the same plugin without the skill. A copy of the plugin installed elsewhere is not used.
- **Example:** `/skill test release-notes`. All five trigger cases behave as expected. The "no merge commits"
  criterion passes 2 of 5 runs against a threshold of 4, while the run without the skill passes 0 of 5; the report shows
  the merge commit that appeared, and `/skill` offers `fix`.

## Criteria

**Test (UC6)**

- R22 (UC6): Each trigger case reports whether the skill fired, beside what was expected.
- R23 (UC6): Each case runs the number of times Verification's implementation sets, each run in a sandbox. No run
  sees state from another run, or the author's own configuration, memory, or user-level skills.
- R24 (UC6, UC6.5): Each criterion reports its pass rate over the runs and the threshold, and passes only when the rate
  meets the threshold.
- R25 (UC6): Each criterion's result is shown beside the baseline's. With no baseline named, the baseline is a run
  without the skill.
- R26 (UC6, UC6.9): The report lists the cases that changed between pass and fail since the skill's expected result,
  or, with none, since the last saved result. With neither, the list is left out and the report says so.
- R27 (UC6): Each fail names the case and the output that broke it.
- R28 (UC6): The result is saved in one shape that every Verification implementation writes, and `fix`, `enhance`,
  and the next `test` read it.
- R29 (UC6): `test` changes no file of the skill, except its expected result when the author accepts one (UC6.11) or
  the first passing run saves one (UC6.12).
- R30 (UC6.2): A skill with no Criteria gets its outcomes reported as not tested, pointing to `check` and `fix`, and
  its trigger cases still run.
- R31 (UC6.3): A skill with no eval cases gets cases proposed from its Intent and Criteria, and none runs before the
  author approves them. With no author present, nothing runs and the missing cases are reported.
- R32 (UC6.4): A run that errors or hits a limit is reported as not run, with the reason, and never counts as a pass.
- R33 (UC6.7): A criterion with no rubric is reported as not tested, pointing to `fix`.
- R34 (UC6.8): A case that would cause an outside effect the run cannot contain is not run, and is reported as such.
- R35 (UC6.10): When the baseline cannot be run, results are reported without it, and the report says so.
- R80 (UC6.11, UC6.12): A result becomes the expected result only by an author's request, or, when the skill has
  none, by a run in which every case and criterion passes; the report says which. An existing expected result is
  replaced only by an author's request. It is kept in the skill's folder, in the shape R28 names, and each run's own
  result is kept out of version control.
- R91 (UC6.13): When a folder above the skill holds a plugin manifest whose skills folder holds the skill, each run
  loads that plugin from the working copy, and the baseline loads it without the skill. Each run reads the plugin's
  references and other skills, and none from an installed copy of it.
- R97 (UC6): Before the first run, `test` reports how many runs it will make, and, when the skill has a saved result,
  about how long and how much they took last time.
- R98 (UC6): When a run ends, `test` reports its case, its arm (with or without the skill), its run number, its count
  out of the total, and its outcome (pass or fail for a result case, fired or not for a trigger case, or not run with
  the reason), never the model's reply.
- R99 (UC6): When no run has ended for 30 seconds, `test` reports how many runs are in progress and how long the
  longest has taken, and repeats that every 30 seconds until a run ends.
- R100 (UC6): Progress goes where the result does not: the result's shape and stream are unchanged, and asking for
  no output turns progress off.
- R101 (UC6): `/skill test` starts the run so the author can keep working, and passes the progress on to them as it
  comes, at least at each heartbeat and every few runs.
