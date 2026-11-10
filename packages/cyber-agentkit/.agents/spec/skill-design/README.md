---
spec-type: behavioral
status: draft
---

# skill-design: a skill author designs a skill through aspects they can swap one at a time

**Outcome:** an author, human or agent, creates, backfills, checks, tests, fixes, and enhances a skill by running `/skill`. Each
step of that work is an aspect whose default ships with `cyber-agentkit`, and any plugin can replace one aspect without editing
the others.

## What

A skill author, human or agent, has no one way to design a skill. The skill-writing tools that exist today (aced's
`define-skill` and `skillify`, Anthropic's `skill-creator`, `plugin-dev`) each walk their own steps and tie them to their
own rules. A team that wants a different rule for one step, such as how a trigger description is checked, has to copy
the whole tool and keep the copy current. None of them asks the author what a different team would want to choose
differently, so choices like the output template end up written into the skill. Anyone who must trust a skill before
sharing it has no common bar to check it against.

`skill-design` splits the work of designing a skill into **aspects**: intent, shape, trigger, verification, and others.
Each aspect states what it receives and what it must produce. `cyber-agentkit` ships a default for every aspect and a
front door, `/skill`, with six commands: create a skill, backfill one from work already done, check it without running
it, test it by running its evals, fix what check or test found, and enhance it beyond that. A team or plugin replaces one aspect with its own and keeps the
rest.

## Non-goals

- **N1.** Defining what a valid skill is. The Agent Skills specification is the floor, and every aspect works within it.
- **N2.** Generating plugin manifests or distributing plugins. `universal-plugin` does that.
- **N3.** Deciding when the process runs: a schedule, or a trigger from session events. The steps are in scope, and the
  loop that calls them is not.
- **N4.** Designing artifacts other than skills (agents, commands, plugins, references), and deciding which one a
  request needs.
- **N5.** A general way to compose any group of references. Only a family of aspects needs the wildcard in customize and
  in the implementations listing.
- **N6.** Building an eval engine. The default Verification runs on an existing one.

## Key terms

- **K1. Aspect.** One step of designing a skill, published as the reference interface `skill-design.aspects.<aspect>`,
  with one implementation chosen. Its contract is what it receives and the criteria its output meets.
- **K2. Core aspect.** Intent, Criteria, Shape, Trigger, or Verification. `create` walks the first four in that order,
  then builds the skill and runs Verification against the Criteria. **Open aspect:** any other. `enhance` reviews every
  aspect, core and open.
- **K3. Family.** The aspect interfaces under `skill-design.aspects`, addressed by a wildcard. No interface is named for
  the family.
- **K4. Front door.** The `/skill` skill with the commands create, backfill, check, test, fix, and enhance. `check`
  reads the skill against every aspect's criteria without running it, like a linter; `test` runs the Verification
  aspect's evals, both whether the skill fires on the right requests and whether its result meets the Criteria.
- **K5. Backfill.** Designing a skill from a source that already exists, such as a session, existing instructions, or
  another skill, instead of from the author's answers. The source shows what the skill does, not what it should do, so
  the author still decides.
- **K6. Rubric.** For one criterion, what a run's output is judged on, so that the run passes or fails it. The
  Verification aspect writes it during `create`, alongside the eval cases.
- **K7. Autonomy.** How much a command applies on its own: `ask` proposes each item and the author decides;
  `apply-safe` applies what passes `check` and `test` with no criterion worse and asks about the rest; `apply` applies
  everything and still reports it.
- **K8. Check script.** The part of an aspect implementation that a script runs without an agent. Its front matter
  names it, and the script reports which of the implementation's criteria it decides.

Default, implementation, extend, selection, and interface are as in [reference](../reference/README.md). Criterion is as
in the design-spec skill.

## Actors and goals

| ID | Actor | Goal |
| --- | --- | --- |
| A1.1 | Skill author | Gets a working skill for a job they describe, without knowing the aspects beforehand. |
| A1.2 | Skill author | Turns work already done (a session, existing instructions, another skill) into a skill whose behavior they chose, not one copied from the source. |
| A1.3 | Skill author | Knows, for each aspect, whether a skill as written meets that aspect's criteria, without running it and with the skill left unchanged. |
| A1.4 | Skill author | Has the failures that check or test found repaired. |
| A1.5 | Skill author | Gets suggestions to improve a skill that already passes, on any aspect, from reading the skill, from how it was used, or from their own request, and applies only the ones they accept. |
| A1.6 | Skill author | Knows whether the skill fires on the requests it should and not on near misses, and whether running it gives a result that meets its Criteria. |
| A2.1 | Agent improving a skill it uses | Makes the skill better from what happened while using it, keeping only changes the evals show help, within the autonomy the user allowed. |
| A3.1 | Team lead | Swaps or extends one aspect and keeps the rest. |
| A3.2 | Team lead | Chooses an implementation for every aspect in one pass, such as taking one plugin's whole set or mixing several, instead of changing aspects one at a time. |
| A3.3 | Team lead | Sets how much freedom each command has. |
| A3.4 | Team lead | Sees which implementation each aspect uses. |
| A3.5 | Team lead | Applies a choice to the whole repo, or only to themselves. |
| A4.1 | Plugin author | Ships an extension or a new open aspect without any change to `/skill`. |
| A4.2 | Plugin author | Knows their implementation meets the aspect's criteria. |

## Use cases

### UC1 — Create a skill for a described job (A1.1)

- **Trigger:** the author wants an agent to do a job repeatably, and has no skill for it.
- **Entry points:** skill (primary): `/skill create [description]`.
- **Inputs:** the author's description of the job; the selected implementation for each aspect (the default unless
  customized); where the skill goes.
- **Success:** the skill exists at the chosen location. It meets the Agent Skills specification and each core aspect's
  criteria, and Verification has passed against the Criteria. The author approved the output of Intent, Criteria, Shape,
  and Trigger before each was written.
- **Extensions:**
  - **UC1.1** A skill with that name already exists. `/skill` stops without overwriting it and points to `check`, `fix`,
    or `enhance`.
  - **UC1.2** The author rejects an aspect's draft. That aspect is redrafted, and any aspect approved after it is
    reopened.
  - **UC1.3** The selected implementation for an aspect cannot be found. That aspect uses the default, and the author is
    told which aspect fell back and which implementation was missing.
  - **UC1.4** Verification fails. The skill stays in place, and the failing criteria are reported so `fix` can repair
    them.
  - **UC1.5** The author stops partway. The aspects already approved stay on disk.
- **Example:** `/skill create "summarize a PR for release notes"`. The author approves the intent, two criteria, a
  single-file shape, and the trigger description; Verification runs the two criteria against a sample PR.

### UC2 — Backfill a skill from work already done (A1.2)

- **Trigger:** the author has already done the job some other way (in a session, as instructions in a document, or in
  another skill) and wants it as a skill.
- **Entry points:** skill (primary): `/skill backfill [description]`.
- **Inputs:** the source, which is the current session's context unless the description names another (a document or
  another skill); the description, which can also say which job in the source to capture; the selected implementation
  for each aspect; where the skill goes.
- **Success:** the same as UC1, except that each aspect's draft starts from the source. The skill generalizes the
  source so it can be reused: the agent proposes what it generalizes over (what would differ on the next run, such as
  the repo, the version, or the target) and the author confirms it. The author decides every point where the source is
  silent, or where what it did differs from what the skill should do. The source is left unchanged.
- **Extensions:**
  - **UC2.1** The description names a source that cannot be read. `/skill` stops and names the source.
  - **UC2.2** The source says nothing for an aspect. That aspect is drafted from the author's answers, as in UC1.
  - **UC2.3** The source holds more than one job, and the description does not say which. `/skill` proposes one skill
    per job, and the author picks which to build.
  - **UC2.4** The same outcomes as UC1.1 and UC1.3 to UC1.5.
  - **UC2.5** The session holds no work to capture and the description names no other source. `/skill` says there is
    nothing to backfill and points to `create`.
- **Example:** `/skill backfill` right after a release done by hand. The session shows the steps taken; the agent
  proposes the package and the version as what varies, and the author decides which steps the skill keeps.

### UC3 — Check a skill as written (A1.3)

- **Trigger:** the author wants to know whether the skill is soundly built as written, meaning its structure,
  description, and instructions meet each aspect's criteria, before running it.
- **Entry points:** skill (primary): `/skill check [skill]`. Script: a check script that `/skill` ships, run without an
  agent, for CI; it covers only the checks a script can decide.
- **Inputs:** the skill, by name or path; the selected implementation for each aspect; optionally, a judge.
- **Success:** every aspect that has criteria, core or open, gets a pass or a fail. Each fail names the criterion it
  breaks and the part of the skill that breaks it. The checks a script can run give the same result without an agent,
  so they can run in CI. Nothing in the skill is run or changed.
  In an interactive run with failures, it ends by offering `fix`; nothing changes unless the author accepts.
- **Extensions:**
  - **UC3.1** The skill cannot be found. `/skill` stops and names what it looked for.
  - **UC3.2** The skill fails the Agent Skills specification. Those failures are reported, and the aspects are still
    checked in the same run.
  - **UC3.3** The selected implementation for an aspect cannot be found. The default is used, as in UC1.3.
  - **UC3.4** A criterion can only be decided by running the skill. It is reported as not checked and pointed to
    `test`, never as a pass.
- **Example:** `/skill check release-notes` passes Intent, Criteria, Shape, and Security, and fails Trigger because the
  description does not say when not to use the skill.

### UC4 — Fix what check or test found (A1.4)

- **Trigger:** failures were reported, by a `check` or `test` run that just ended or by an earlier result, and the
  author, or an agent, wants them repaired.
- **Entry points:** skill (primary): `/skill fix [skill]`, or accepting the offer at the end of `check` or `test`.
- **Inputs:** the skill; the failures, from the latest `check` or `test` result in the session, or else from running
  `check`, and `test` only when the author asks for it; the selected implementation for each aspect; optionally, a
  judge.
- **Success:** each failure is repaired, or reported as not repaired with the reason. Each change touches only what a
  failure named. The checks that failed are run again and pass.
- **Extensions:**
  - **UC4.1** The skill cannot be found. `/skill` stops and names what it looked for.
  - **UC4.2** There are no failures. `/skill` says there is nothing to fix and leaves the skill unchanged.
  - **UC4.3** A repair needs a decision only the author can make, such as changing the Intent. The author is asked;
    with no author present, the failure is reported as not repaired.
  - **UC4.4** A repair makes another criterion fail. With the author present, `/skill` shows both criteria and the
    author keeps the change, undoes it, or asks for another repair. With no author present, the repair is undone and
    both criteria are reported.
  - **UC4.5** The skill came from an installed plugin. The edit goes ahead (see Q2).
  - **UC4.6** The selected implementation for an aspect cannot be found. The default is used, as in UC1.3.
- **Example:** `check` fails Trigger on `release-notes` and offers `fix`. The author accepts, `fix` adds when-not-to-use
  lines to the description, and `check` then passes Trigger.

### UC5 — Suggest enhancements to a skill (A1.5, A2.1)

- **Trigger:** the skill passes `check`, and the author wants to know what could make it better. They may have evidence
  from using it, such as a run that went wrong or a correction they made, or a request of their own.
- **Entry points:** skill (primary): `/skill enhance [skill] [prompt]`.
- **Inputs:** the skill; an optional prompt, which is a focus ("make it safer"), a request ("also draft the changelog
  entry"), or a pointer to evidence; evidence of use, the current session by default; the selected implementation for
  each aspect.
- **Success:** `/skill` reviews the skill against every aspect, and against the evidence and the prompt when there are
  any. It offers each suggestion on its own, with the change, the aspect it touches, and the reason; a suggestion that
  came from evidence cites it. A suggestion the skill already covers is not offered. The author's answer to one
  suggestion decides nothing about the others. Only accepted suggestions are written, and a change to a core aspect
  reopens the core aspects after it, as in UC1.2. `check` passes afterwards. With no author present, `/skill` applies
  only what the autonomy setting allows (UC10) and reports the rest.
- **Extensions:**
  - **UC5.1** The skill cannot be found. `/skill` stops and names what it looked for.
  - **UC5.3** The skill fails `check`. `/skill` points to `fix`, and continues only if the author says so.
  - **UC5.4** An accepted suggestion makes a criterion fail. Handled as in UC4.4.
  - **UC5.5** There is nothing to suggest. That is reported, and the skill is unchanged.
  - **UC5.6** The selected implementation for an aspect cannot be found. The default is used, as in UC1.3.
  - **UC5.7** The request describes a different job from the skill's Intent. `/skill` says so and points to `create`.
  - **UC5.9** The prompt names evidence that cannot be read. `/skill` stops and names it.
- **Example:** after a run in which the author told the skill to leave out merge commits, `/skill enhance
  release-notes` suggests a criterion excluding them, citing that correction, and Security suggests asking before the
  skill posts to GitHub. The author accepts both.

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
  and fail since the last run are listed. Each fail names the case and the output that broke it. The result is saved in
  one shape that every Verification implementation writes, where `fix`, `enhance`, and the next `test` read it. The
  skill is unchanged. In an interactive run with failures, it ends by offering `fix`.
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
- **Example:** `/skill test release-notes`. All five trigger cases behave as expected. The "no merge commits"
  criterion passes 2 of 5 runs against a threshold of 4, while the run without the skill passes 0 of 5; the report shows
  the merge commit that appeared, and `/skill` offers `fix`.

### UC7 — Improve a skill from its own use (A2.1)

- **Trigger:** while or after using a skill, the agent sees evidence that the skill could be better: the user corrected
  the result, a step failed or was worked around, or the skill fired when it should not have, or did not when it
  should.
- **Entry points:** skill (primary): `/skill enhance [skill] [prompt]`, run by the agent with that evidence (UC5). When
  the loop runs is out of scope (N3).
- **Inputs:** the evidence, from what the harness already records (the session where the skill ran, past transcripts,
  its memory store), with no hooks required; the skill; the autonomy setting (UC10).
- **Success:** the evidence becomes suggestions, as in UC5. A lesson is offered only once it has occurred at least
  twice. A trigger miss also becomes a new trigger eval case, and a wrong result a new outcome case, so the same
  failure is tested from then on. A suggestion is applied only when the autonomy setting allows it and `test` shows no
  criterion worse than the last result; every other suggestion is left for the author, citing its evidence.
- **Extensions:**
  - **UC7.1** The evidence points at another skill, or at no skill (for example a fault in the harness). Nothing
    changes, and the report says where the evidence points.
  - **UC7.2** `test` cannot run, for example because there are no cases or the budget ran out. The change is not
    applied, and is left as a suggestion.
  - **UC7.3** The change makes a criterion worse than the last result. The change is not applied, as in UC4.4 with no
    author present.
  - **UC7.4** The skill came from an installed plugin. The skill is not edited, because a plugin update would overwrite
    the change; the suggestion is left for the author to contribute upstream.
- **Example:** in one session the user tells the agent twice to leave out merge commits. At the end the agent runs
  `enhance` with that session; it adds a "no merge commits" criterion and a case for it, `test` shows the criterion
  passing and nothing worse, and the change is applied within the autonomy setting and reported.

### UC8 — Choose an implementation for one aspect (A3.1, A3.5)

- **Trigger:** a team wants a different rule for one step of designing a skill, such as its own trigger check, and
  keeps the rest.
- **Entry points:** skill (primary): the `reference` skill's Customize mode. Code: `reference customize
  skill-design.aspects.<aspect>`.
- **Inputs:** the aspect; the pick, as in [reference UC9](../reference/write/README.md); the tier, `repo` for the whole
  repository or `user` for the customizer alone.
- **Success:** the next `/skill` command uses the pick for that aspect and leaves every other aspect as it was. Picking,
  extending, tiers, and what happens when a picked plugin is missing are as in reference UC9 and UC18.
- **Extensions:** none beyond reference UC9 and UC18; at run time a pick that cannot be found falls back to the
  default, as in UC1.3.

### UC9 — Choose for every aspect at once (A3.2, A3.4)

- **Trigger:** a team adopts `skill-design` and wants to choose an implementation for each aspect in one pass, or see
  which one each aspect uses.
- **Entry points:** skill (primary): the `reference` skill's Customize and Find modes. Code: `reference customize` and
  `reference implementations` on `skill-design.aspects.*`.
- **Inputs:** the wildcard `skill-design.aspects.*`; for customize, a pick per aspect or one plugin for all of them;
  the tier.
- **Success:** one command writes a pick for each aspect the wildcard matches, and one command lists each aspect with
  the implementation it uses and the ones available. The wildcard is a change to the `reference` spec, which owns its
  behavior; this spec states only the goal (N5).
- **Extensions:**
  - **UC9.1** One plugin is picked for all aspects and does not implement some of them. Those aspects keep their
    current pick, and the result names them.

### UC10 — Set how much each command applies on its own (A3.3)

- **Trigger:** a team or user wants commands to apply more, or less, without asking.
- **Entry points:** skill (primary): the `reference` skill's Customize mode on `skill-design.autonomy`.
- **Inputs:** a level (K7) per command; the tier.
- **Success:** each command acts at its level. With no setting, `create` and `enhance` are `ask`, `backfill` and `fix`
  are `apply-safe`, and `check` and `test` change nothing at any level. To customize the `skill-design` references,
  the author picks them from one list instead of being asked about each in turn. The setting lives outside the `aspects` segment, so the aspect wildcard
  never matches it.
- **Extensions:**
  - **UC10.1** A level is set for `check` or `test`. It has no effect, and `/skill` says so.
  - **UC10.2** A level names no known value. That command uses its default, and `/skill` says so.

### UC11 — Ship a new open aspect or an implementation (A4.1, A4.2)

- **Trigger:** a plugin author wants to add an open aspect, or ship their own implementation of an existing aspect.
- **Entry points:** skill (primary): the `reference` skill's Create and Inspect modes. Code: `reference create`,
  `reference check`, `reference implementations`.
- **Inputs:** for a new aspect, an interface document named `skill-design.aspects.<aspect>`; for an implementation, a
  document that implements one; the plugin.
- **Success:** once the plugin is installed, `/skill` finds a new open aspect through the family wildcard, and
  `enhance` reviews it, with no change to `/skill`. An implementation is listed by `implementations` only when it
  passes the interface check, as in [reference UC6](../reference/interfaces/README.md) and UC15. The author can tell
  whether its output meets the aspect's criteria, not only its sections (Q6).
- **Extensions:**
  - **UC11.1** A new aspect is named `interface` or `default`. It is refused, because `skill-design.aspects.interface`
    and `skill-design.aspects.default` would collide with the name endings the `reference` spec gives interface
    documents and defaults (its K8 and K13).
  - **UC11.2** A plugin tries to add a core aspect. It becomes an open aspect; only `cyber-agentkit` defines the core
    five (K2).

## Criteria

**Every command (UC1 to UC6)**

- R1 (UC3.1, UC4.1, UC5.1, UC6.1): When the skill named cannot be found, the command stops, names what it looked for,
  and writes nothing.
- R2 (UC1.3, UC3.3, UC4.6, UC5.6, UC6.6): When an aspect's selected implementation cannot be found, the command uses
  that aspect's default and says which aspect fell back and which implementation was missing.
- R3 (UC1, UC2, UC4, UC5): A skill that `create` or `backfill` writes meets the Agent Skills specification.
- R4 (UC3, UC6): In an interactive run that found failures, `check` and `test` end by offering `fix`. Nothing changes
  unless the author accepts. With no author present, no offer is made.

**Create and backfill (UC1, UC2)**

- R5 (UC1): `create` drafts Intent, Criteria, Shape, and Trigger in that order, then builds the skill, then runs `test`.
- R6 (UC1, UC2, UC10): At `ask`, no aspect's output is written before the author approves it.
- R7 (UC1.1, UC2.4): When a skill with that name exists at the chosen location, the command stops, leaves it unchanged,
  and points to `check`, `fix`, and `enhance`.
- R8 (UC1.2): When the author rejects an aspect's draft, that aspect is redrafted, and every aspect after it in K2's
  order that was approved is reopened.
- R9 (UC1.4): When the last step's `test` fails, the skill stays in place and the failing criteria are reported.
- R10 (UC1.5): When the author stops partway, every aspect already approved stays on disk.
- R11 (UC2): `backfill` leaves its source unchanged.
- R12 (UC2): Before it drafts, `backfill` proposes what the skill generalizes over, and the author confirms it.
- R13 (UC2.2): An aspect the source says nothing for is drafted from the author's answers, as in `create`.
- R14 (UC2.1): When the named source cannot be read, `backfill` stops and names it.
- R15 (UC2.3): When the source holds more than one job and the description names none, `backfill` proposes one skill
  per job and builds none until the author picks.
- R16 (UC2.5): When the session holds no work and no other source is named, `backfill` says there is nothing to
  backfill, points to `create`, and writes nothing.

**Check (UC3)**

- R17 (UC3): Every aspect that has criteria, core or open, gets a pass, a fail, or a not checked. Each fail names the
  criterion and the part of the skill that breaks it.
- R18 (UC3): `check` changes no file and runs no part of the skill.
- R19 (UC3): The check script runs only the checks a script can decide, and each gives the same result as in
  `/skill check`. It reports every other check as not checked, needing `/skill check`, never as a pass. It exits
  non-zero when any check it ran fails.
- R75 (UC3, UC11): An aspect implementation names its check script (K8) in front matter, and the script run in CI
  runs the check script of each selected implementation. An implementation that extends another, and names none of
  its own, uses the one it extends, as the `reference` spec merges front matter.
- R76 (UC3): An implementation with no check script has all its criteria reported as not checked in CI.- R20 (UC3.2): A skill that fails the Agent Skills specification gets those failures reported, and every aspect is
  still checked in the same run.
- R21 (UC3.4): A criterion that only a run can decide is reported as not checked and points to `test`, never as a
  pass.

**Test (UC6)**

- R22 (UC6): Each trigger case reports whether the skill fired, beside what was expected.
- R23 (UC6): Each case runs the number of times Verification's implementation sets, each run in a sandbox. No run
  sees state from another run, or the author's own configuration, memory, or user-level skills.
- R24 (UC6, UC6.5): Each criterion reports its pass rate over the runs and the threshold, and passes only when the rate
  meets the threshold.
- R25 (UC6): Each criterion's result is shown beside the baseline's. With no baseline named, the baseline is a run
  without the skill.
- R26 (UC6, UC6.9): The report lists the cases that changed between pass and fail since the last saved result. With
  no saved result, the list is left out and the report says so.
- R27 (UC6): Each fail names the case and the output that broke it.
- R28 (UC6): The result is saved in one shape that every Verification implementation writes, and `fix`, `enhance`,
  and the next `test` read it.
- R29 (UC6): `test` changes no file of the skill.
- R30 (UC6.2): A skill with no Criteria gets its outcomes reported as not tested, pointing to `check` and `fix`, and
  its trigger cases still run.
- R31 (UC6.3): A skill with no eval cases gets cases proposed from its Intent and Criteria, and none runs before the
  author approves them. With no author present, nothing runs and the missing cases are reported.
- R32 (UC6.4): A run that errors or hits a limit is reported as not run, with the reason, and never counts as a pass.
- R33 (UC6.7): A criterion with no rubric is reported as not tested, pointing to `fix`.
- R34 (UC6.8): A case that would cause an outside effect the run cannot contain is not run, and is reported as such.
- R35 (UC6.10): When the baseline cannot be run, results are reported without it, and the report says so.

**Fix (UC4)**

- R36 (UC4): `fix` repairs the failures in the latest `check` or `test` result of the session. With none, it runs
  `check`, and runs `test` only when the author asks.
- R37 (UC4): Each failure is repaired or reported as not repaired, with the reason.
- R38 (UC4): No part of the skill changes that no failure named.
- R39 (UC4): After repairing, `fix` runs the failed checks again and reports their result.
- R40 (UC4.2): With no failures, `fix` says there is nothing to fix and leaves the skill unchanged.
- R41 (UC4.3): A repair that needs a decision only the author can make is asked. With no author present, the failure
  is reported as not repaired.
- R42 (UC4.4, UC5.4): When a change makes another criterion fail, the author is shown both criteria and keeps the
  change, undoes it, or asks for another repair. With no author present, the change is undone and both criteria are
  reported.
- R43 (UC4.5): `fix` edits a skill that came from an installed plugin.

**Enhance and self-improvement (UC5, UC7)**

- R44 (UC5): `enhance` reviews the skill against every aspect installed, core and open.
- R45 (UC5): Each suggestion is offered on its own, with the change, the aspect it touches, and the reason. A
  suggestion drawn from evidence cites it.
- R46 (UC5): No suggestion repeats a change the skill's text already has, or one the author declined earlier for this
  skill.
- R47 (UC5): Only accepted suggestions are written, and the answer to one decides nothing about the others.
- R48 (UC5): A written change to a core aspect reopens every core aspect after it, as in R8.
- R49 (UC5): After `enhance` writes, `check` passes, or R42 applies.
- R50 (UC5.3): When the skill fails `check`, `enhance` points to `fix` and goes on only if the author says so. With no
  author present, it stops.
- R51 (UC5.5): With nothing to suggest, `enhance` says so and leaves the skill unchanged.
- R52 (UC5.7): When the request describes a different job from the skill's Intent, `enhance` says so, points to
  `create`, and leaves the skill unchanged.
- R53 (UC5.9): When the prompt names evidence that cannot be read, `enhance` stops and names it.
- R54 (UC7): A lesson from evidence of use is offered only once it occurs at least twice across all the evidence
  read, whether in one session or several.
- R55 (UC7): A trigger miss adds a trigger eval case, and a wrong result adds an outcome case.
- R56 (UC7): A suggestion is applied without the author only when the autonomy level allows it and `test` shows no
  criterion worse than the last saved result. Every other suggestion is left for the author, citing its evidence.
- R57 (UC7): Evidence is read from what the harness already records, with no hook installed.
- R58 (UC7.1): Evidence that points at another skill, or at no skill, changes nothing, and the report says where it
  points.
- R59 (UC7.2): When `test` cannot run, the change is not applied and is left as a suggestion.
- R60 (UC7.4): A skill that came from an installed plugin is not edited from evidence of use; the suggestion is left
  for the author to contribute upstream.

**Autonomy (UC10)**

- R61 (UC10): With no setting, `create` and `enhance` are `ask`, and `backfill` and `fix` are `apply-safe`.
- R62 (UC10): At `apply-safe`, a command applies only the changes after which `check` and `test` pass with no
  criterion worse, and asks about the rest; with no author present, it reports the rest. At `apply`, it applies every
  change and reports each one.
- R74 (UC2, UC4.3, UC10): A decision only the author can make (R12, R13, R41) is asked at every level, whatever else
  the level applies on its own. With no author present, it is reported as not applied.
- R63 (UC10.1): A level set for `check` or `test` has no effect, and `/skill` says so.
- R64 (UC10.2): A level that names no known value leaves that command at its default, and `/skill` says so.
- R65 (UC10): The level is read from the reference `skill-design.autonomy`, which the wildcard
  `skill-design.aspects.*` does not match.
- R66 (UC8, UC9, UC10): To customize the `skill-design` references, `/skill` lists them, and the author picks which to
  customize in one answer instead of being asked about each in turn.

**Aspects and implementations (UC8, UC9, UC11)**

- R67 (UC8, UC11): Each aspect is the reference interface `skill-design.aspects.<aspect>`, and `cyber-agentkit` ships a
  default for every aspect it defines.
- R68 (UC8): After a pick for one aspect, the next command uses it for that aspect, and every other aspect behaves as
  before.
- R69 (UC9): One `customize` on `skill-design.aspects.*` writes a pick for every aspect it matches, and one
  `implementations` on it lists each aspect with the implementation it uses and the ones available.
- R70 (UC9.1): When one plugin is picked for every aspect and lacks some, those aspects keep their current pick, and
  the result names them.
- R71 (UC11): An open aspect that an installed plugin ships is checked by `check` and reviewed by `enhance`, with no
  change to `/skill`.
- R72 (UC11.1): An aspect named `interface` or `default` is refused.
- R73 (UC11.2): An aspect a plugin marks as core is treated as open.

## Open questions

- **Q2.** Editing a skill that came from an installed plugin is allowed. Whether `/skill` first says that a plugin update
  will overwrite the edit is leaning yes, in one line.
- **Q3.** Whether skill distribution (`npx skills`) is an aspect of `skill-design`, or belongs to plugin distribution.
- **Q5.** What a skill consumer, who uses a designed skill but never runs `/skill`, gets from `skill-design`. They are
  affected by the outcome, so they may be an actor, but no goal for them is settled. The supply-chain checks on a
  skill (its source, whether it is maintained, its licence) may belong here rather than in `check`.
- **Q6.** How a plugin author tells that an aspect implementation's output meets the aspect's criteria. Direction:
  each aspect interface ships sample skills with known results, so the default and another implementation can be run
  side by side. Not settled.
