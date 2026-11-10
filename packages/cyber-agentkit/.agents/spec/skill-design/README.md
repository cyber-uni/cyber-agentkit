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
| A2.1 | Agent running `/skill`, including a self-improve loop | Does A1's work with only the autonomy the user allowed. It never guesses an input it has no source for, and reports each one instead. |
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
- **Entry points:** skill (primary): `/skill check [skill]`.
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
  only what the autonomy setting allows (Q1) and reports the rest.
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

## Open questions

- **Q1.** Autonomy by command. Direction: `backfill` and `fix` act more on their own; `create` and `enhance` propose and
  the author decides each item; `check` and `test` change nothing. Customizing the `skill-design` references themselves needs no
  approval each time. What each default is, and where a user changes it, is not settled.
- **Q2.** Editing a skill that came from an installed plugin is allowed. Whether `/skill` first says that a plugin update
  will overwrite the edit is leaning yes, in one line.
- **Q3.** Whether skill distribution (`npx skills`) is an aspect of `skill-design`, or belongs to plugin distribution.
- **Q4.** Where the default eval loop and structural audit end and aced's BDD-style evals begin. The default is closer to
  `skill-creator`; aced's approach involves SDD.
- **Q5.** What a skill consumer, who uses a designed skill but never runs `/skill`, gets from `skill-design`. They are
  affected by the outcome, so they may be an actor, but no goal for them is settled. The supply-chain checks on a
  skill (its source, whether it is maintained, its licence) may belong here rather than in `check`.
