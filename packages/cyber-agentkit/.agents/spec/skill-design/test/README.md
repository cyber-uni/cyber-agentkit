---
spec-type: behavioral
status: draft
---

# skill-design/test — an author knows whether a skill fires on the right requests and gives a result that meets its Criteria

Part of [skill-design](../README.md). Its What, non-goals, key terms, actors, every-command criteria, and aspect
contract apply here; IDs are shared across the parent and its children. Retired IDs: R102.

## Use cases

### UC6 — Test a skill by running it (A1.6)

- **Trigger:** the author wants to know whether the skill fires on the requests it should and not on near misses, and
  whether running it gives a result that meets its Criteria, for example after a change or before sharing it.
- **Entry points:** skill (primary): `/skill test [skill]`. `create` also runs it as its last step (UC1).
- **Inputs:** the skill; its Criteria, each with a rubric; its eval cases, meaning requests that should and should not
  trigger it and sample inputs for outcome runs, grouped in scopes (K11); the baseline, a run without the skill by default or a previous
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
    reason, and never as a pass. The account's usage limit is UC6.22.
  - **UC6.5** A case gives different results on different runs. That is expected: the pass rate over the runs is the
    result.
  - **UC6.6** The selected implementation for an aspect cannot be found. The default is used, as in UC1.3.
  - **UC6.7** A criterion has no rubric. That criterion is reported as not tested, pointing to `fix`.
  - **UC6.8** A case would cause an outside effect the run cannot contain, such as posting to GitHub. It is not run, and
    is reported as such.
  - **UC6.9** There is no earlier result. The list of changed cases is left out, and the report says so.
  - **UC6.10** The baseline cannot be run, for example because the previous version cannot be found. Results are
    reported without it, and the report says so.
  - **UC6.11** The author accepts a result. Each case the run finished gets its entry in its scope's expected result,
    and every other entry stays as it was. The expected result is kept with the skill and shared through version
    control, while each run's own result stays local to the author's copy.
  - **UC6.12** A case has no expected entry yet, and its runs pass. Its entry is saved, and the report says so. A case
    with a fail gets no entry.
  - **UC6.13** The skill is part of a plugin the author is developing in the working copy. Each run loads that plugin
    from the working copy, with its references and its other skills, as an install of it would; the baseline loads
    the same plugin without the skill. A copy of the plugin installed elsewhere is not used.
  - **UC6.14** The author names some cases, to try a change without paying for every case. Only those cases run, and
    the result says it covers only them. It is compared with their entries only, and accepting it writes theirs
    only, as in UC6.11.
  - **UC6.15** The author names a harness other than Claude Code. Each run drives that harness, isolated the same way,
    and the result has the same shape. A harness the test cannot drive is an error, and nothing runs. What still
    reaches a run from the author's setup on that harness is reported.
  - **UC6.16** The author names another engine to run the cases, such as Claude Code's own plugin evals. The result
    has the same shape. A check that engine cannot run is reported as not tested.
  - **UC6.17** A case needs a starting state that plain files cannot hold, such as a git history with uncommitted
    work. The case names a setup script that makes it in each run's folder before the model starts, in both arms and
    on every engine, so its prompt holds only the request. When the script fails, the run is not run and the report
    shows the script's output.
  - **UC6.18** The skill comes from outside the current repository, such as another author's plugin. The test lists
    each script its cases would run and runs none until the author says to trust them; the cases that need them are
    reported as not run.
  - **UC6.19** The author adds or removes a case. A command makes or deletes that case's files and its entry, and
    nothing outside the skill's eval files.
  - **UC6.20** A case keeps a behavior that passes without the skill too, such as one another part of the plugin
    teaches. The author marks it as a guard, and the report shows its pass in both arms as expected rather than as a
    skill that adds nothing. A guard that fails with the skill is still a failure.
  - **UC6.21** The author names no model. The runs use a mid-tier model of the harness, not its most capable one, so a
    full test costs less. The author can name a model, or a tier, for the whole test, and a case can name its own,
    which wins over both, for a case known to need a stronger or a cheaper model. The judge's model is set apart. The
    result names the model each case ran on, and a comparison with a result taken on another model says so. A harness
    whose tiers are not known runs on its own default, and the report says so.
  - **UC6.22** The account's usage limit is reached partway through. No new run starts; the result says the limit was
    reached, when it resets, and which runs are left, and it is incomplete, so no case with a run at the limit gets an entry.
    After the reset, the author runs only the runs left and they join the incomplete result.
  - **UC6.23** The estimate for the runs is over the test budget, whichever command starts `test` and at every
    autonomy level. No run starts, and the run stops, offering to run every case, to run some cases, or not to run.
  - **UC6.24** The author's machine cannot run the sandbox, or the author's team chose to test without one. The
    author, the team, or an administrator picks the folder-only sandbox, for one test or for every test. The runs,
    setup scripts and script checks included, go on with no sandbox, and the result says they did.
  - **UC6.25** The author names no cases. Only the stale cases (K12) run, and the report says, for each scope, which
    input changed. With none stale, nothing runs and the report says the expected result is current. The author can
    ask for every case instead.
  - **UC6.26** The author made a change that alters no behavior, such as a typo fix, and it made cases stale. The
    author carries their entries forward with a reason, without a run. The entries are marked carried, and the report
    shows them as carried, never as a pass from a run.
  - **UC6.27** The skill's evals are in the single-list form, with one expected result for every case. A command shows
    a plan to move them into scopes, and writes it only on the author's request. Each entry it carries over is marked
    as carried by migration, with the date it was recorded. A skill not migrated keeps working as one root scope.
  - **UC6.28** A trigger case has no ID of its own. Its ID is its place in the list, as before, and `check` warns.
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
  or, with none, since the last saved result, matching each case by its ID (R175). With neither, the list is left
  out and the report says so.
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
  The account's usage limit is the exception R162 names.
- R33 (UC6.7): A criterion with no rubric is reported as not tested, pointing to `fix`.
- R34 (UC6.8): A case that would cause an outside effect the run cannot contain is not run, and is reported as such.
- R35 (UC6.10): When the baseline cannot be run, results are reported without it, and the report says so.
- R80 (UC6.11, UC6.12): A case's expected entry is written only by an author's request, or, when the case has none,
  by a run in which the case passes every criterion it tests; the report says which. An existing entry is replaced
  only by an author's request. The expected result is kept in the skill's folder, one per scope (R181), in the shape
  R28 names, and each run's own result is kept out of version control.
- R91 (UC6.13): When a folder above the skill holds a plugin manifest whose skills folder holds the skill, each run
  loads that plugin from the working copy, and the baseline loads it without the skill. Each run reads the plugin's
  references and other skills, and none from an installed copy of it. Each run's copy is its own, so a check can
  tell whether that run changed the plugin. A run whose shell changes into its copy keeps running shell commands.
- R97 (UC6): Before the first run, `test` reports how many runs it will make, and, when the skill has a saved result,
  about how long and how much they took last time. When that result does not record how many runs it made, the report
  says the count is unknown rather than guess it.
- R98 (UC6): When a run ends, `test` reports its case, its arm (with or without the skill), its run number, its count
  out of the total, and its outcome (pass or fail for a result case, fired or not for a trigger case, or not run with
  the reason), never the model's reply.
- R99 (UC6): When no run has ended for 30 seconds, `test` reports how many runs are in progress and how long the
  longest has taken, and repeats that every 30 seconds until a run ends.
- R100 (UC6): Progress goes where the result does not: the result's shape and stream are unchanged, and asking for
  no output turns progress off.
- R103 (UC6): Fewer than half of the machine's hardware threads, and at least one, run at once. An eval set may ask
  for fewer, never more.
- R104 (UC6): In a run, one shell command stops after 30 seconds unless the model asks for longer, and after 2 minutes
  at most, so a runaway command fails fast and the run goes on.
- R105 (UC6.15): `test` drives each harness whose definition declares where a run keeps its config, skills,
  plugins, and login, and builds each run's isolation from that declaration. It drives at least one harness besides
  Claude Code. A harness with no such declaration is an error before any run. What the declaration says still reaches
  a run is reported as a warning.
- R106 (UC6.16): `test` can run its cases on `claude plugin eval`, and the result has the shape R28 names, with the
  same baseline rules as R25 and R91. A criterion whose rubric that engine cannot decide is reported as not tested,
  with the reason.
- R107 (UC6): A Claude Code run reads and writes only its own folder, apart from the programs it runs, and reaches the network
  only for the hosts its case lists. What a run tried and was refused is listed in the result, naming the run, so a
  skill that reaches past its folder shows it.
- R108 (UC6): When the Claude Code runs cannot log in, `test` says why in plain words before any run spends anything, and saves no
  result, instead of reporting each run as not run.
- R101 (UC6): `/skill test` starts the run so the author can keep working, and passes the progress on to them at most
  once a minute, while something has changed since the last update. Each update gives the count so far, each run with
  the skill that failed or was not run since the last update, and the latest heartbeat when no run ended.
- R137 (UC6.4): The reason a run did not run is one short line that names what went wrong, without the wrapping the
  engine puts around it.
- R138 (UC6): From a saved result, the author can reach the whole reply of every run, passed, failed, or not run, in
  both arms, without opening the engine's own store. The reply stays local: an expected result never carries it, nor
  anything that names the author's machine.
- R154 (UC6.4): A run that a known fault of the test sandbox broke, recognized by the error's fixed text in the run's
  tool output or error, is reported as a sandbox failure, not as a pass, a fail, or not run. It counts toward no pass
  rate, the report warns of it before any pass rate and counts it per case, and a result holding one becomes the
  expected result only by the author accepting it after seeing it. The faults recognized are kept in one list that
  more can be added to.
- R155 (UC6.17): A case may name a setup script. Each run, in both arms and on every engine, starts from the state the
  script makes in the run's folder after the case's files are committed and before the model starts. The script is
  not part of the run's folder.
- R156 (UC6.17): A run whose setup script fails is reported as not run, with the script's output, and counts toward no
  pass rate.
- R157 (UC6.17): A setup script and a `script` check run contained as a run's shell commands are: they write only to
  the run's folders and reach no network. When that containment cannot start, no script runs outside it. A script
  sees the run's folder as the run left it: nothing the containment adds to protect it shows as a change there.
- R158 (UC6.18): For a skill whose folder is outside the current repository, `test` lists every setup script and
  `script` check before any run, and runs none of them unless the author passes a flag to trust them; the cases that
  need them are reported as not run, with the reason. `vet` runs no script of a skill.
- R159 (UC6.19): A `case` command adds a case, scaffolding its files folder, setup script when asked, and entry, and
  removes one, deleting only its own files and entry. It refuses a case ID or a path that would reach outside the
  skill's eval files, and changes nothing then. A case it adds always carries an ID, and goes in the eval folder of
  the scope the author names.
- R160 (UC6.20): A case may be marked as a guard. The result marks it, with its baseline pass rate, and marks each
  criterion only guards test. The `test` and `report` output show a guard's pass in both arms as expected, and the
  report's gap over the baseline leaves out the criteria only guards test. A guard is passed or failed by its runs with
  the skill, as any case is.
- R161 (UC6.21): With no model named, each run uses the harness's mid-tier model. A model or tier named for the test
  applies to every case, and a case's own model or tier wins over it; neither changes the judge's model. A tier that
  the harness's definition does not map to a model is an error before any run, and with no model named on such a
  harness the runs use its default and the report says so. The result names the model each case ran on, and the
  cases whose model differs from the result they are compared with are listed with both models.
- R162 (UC6.22): A run that the harness ends with its usage-limit message, recognized by the message's fixed text, is
  reported as limit reached, not as a pass, a fail, or not run. Once one is, no new run starts, and each run left is
  reported as limit reached too. Those runs count toward no pass rate, and a case with none of its runs finished is not
  run. The result is marked incomplete, and no case with a run at the limit gets an entry, saved or accepted. The
  report and the progress say the limit was reached, when it resets when the message says, and which runs are left.
  The messages recognized are kept in one list that more can be added to.
- R166 (UC1, UC6.23; E2): Before any run, `test` estimates the runs and their cost against the test budget, whichever
  command starts it. Over the budget, no run starts, and the run stops with the Stop outcome R167 states; the decision
  gives the run count and the estimate, and offers to run every case, to run some cases, or not to run.
- R168 (UC6.24): The sandbox each run takes is held as data, in named templates that a setting may be changed over.
  The default template is the full sandbox of R23 and R157. The folder-only template runs the agent's shell commands,
  setup scripts, and script checks with no sandbox, on every engine. Each run still gets a fresh folder holding only
  the skill and its case files, loads no other skill or plugin, and keeps its file tools to its own folder. Only the
  administrator, the repository, the user, or an option given for one test may choose the template or change a
  setting; nothing the skill or another plugin ships can. Settings it cannot read stop the test before any run. A
  result records which sandbox did not run and lists the paths outside the run's folder its shell commands changed. It
  can be accepted as the expected result like any other.
- R163 (UC6.22): `test` asked to resume runs only the runs an incomplete result has left, and the result holds the
  runs it had and the new ones, as one run of the whole test would. It refuses, and runs nothing, when the last result
  is not incomplete, or when the skill or its eval cases changed since that result.

**Scopes and stale cases (UC6.11, UC6.14, UC6.25 to UC6.28)**

- R175 (UC6, UC6.28): Every case has an ID that is unique in the skill: its own `id`, or, for a trigger case with
  none, `trigger-<n>` from its place in the list. The expected result, the result history, a named case, a
  known-failure mark, and the list of changed cases all match a case by that ID, never by its place.
- R176 (UC6.14): `test` given case IDs runs only those cases and marks its result as partial, naming them. A partial
  result is compared with those cases' entries only. A case ID the eval set does not hold is an error, and nothing
  runs.
- R177 (UC6.25): Given no case IDs, `test` runs exactly the stale cases (K12), and the report names, for each scope it
  ran, the input that changed or the cases that had no entry. Given the request for every case, it runs every case.
  The estimate and the test budget (R166) count only the runs selected.
- R178 (UC6.25): The inputs of an instructions file's scope are that file, every file it links and every named
  reference it loads, what each of those reaches in turn, its eval folder, and the shared part of `SKILL.md`. The shared part is
  every section except the front matter's description and the router table's rows; a row belongs to the scope of the
  file it links. The inputs of the root scope are the body of `SKILL.md` and what it reaches. The inputs of the
  trigger scope are the description, the trigger cases, and the descriptions of the other skills a run loads.
- R179 (UC6.25): A named reference counts as the content a run resolves for it, so a copy in the author's own user or
  repository tier that no run reads changes nothing. A change only to whitespace or line wrapping is not a change.
  Built scripts, the model, the harness, and the Verification implementation are not inputs: a change to one makes no
  case stale, and the report lists it (R161 for the model).
- R180 (UC6.25): A case's own definition is its entry in the eval set, its files folder, its setup script, and the
  rubrics of the criteria it tests. A change to it makes that case stale and no other.
- R181 (UC6.11, UC6.12): The expected result is kept per scope, in the scope's eval folder, as one entry per case keyed
  by its ID. Each entry records the case's result per criterion, the model, when it was recorded, and what R180 and
  R178 hash at that time. Writing it changes only the entries of cases the run finished; an entry of a case no longer
  in the eval set is dropped. The history of earlier expected results is kept per scope.
- R182 (UC6.11): A criterion's result beside the expected one is computed from the entries of the cases that test it.
  When those entries were recorded at different times, the report gives the oldest.
- R183 (UC6.26): The author can carry the entries of a scope, or of named cases, forward to the current inputs with a
  reason, without a run. Each such entry is marked carried, with the reason, and the report and `check` show it as
  carried, never as a pass from a run.
- R184 (UC6.27): A `migrate` command reports a plan and writes it only when asked. The plan gives each trigger case an
  ID made from its prompt, which the author may change; moves each outcome case into the eval folder of the
  instructions file its ID names, and lists the cases that match none, which stay in the root scope; and splits the
  expected result into one per scope, moving known-failure marks with their cases. It matches an old trigger entry by
  its prompt and an old outcome entry by its ID. Each entry it carries is marked carried by migration with the date it
  was recorded, and a case whose old entry no longer matches gets none.
- R185 (UC6.27, UC6.28): A skill whose evals are in the single-list form is tested as one root scope, with the
  criteria above applied to it, and nothing about it fails until the author migrates it.
