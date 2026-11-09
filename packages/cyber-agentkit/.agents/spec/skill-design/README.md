---
spec-type: behavioral
status: draft
---

# skill-design: a skill author designs a skill through aspects they can swap one at a time

**Outcome:** an author, human or agent, creates, backfills, checks, fixes, and enhances a skill by running `/skill`. Each step of
that work is an aspect whose default ships with `cyber-agentkit`, and any plugin can replace one aspect without editing
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
front door, `/skill`, with five commands: create a skill, backfill one from work already done, check one against what each aspect must produce, fix what
check or the evals found, and enhance one beyond that. A team or plugin replaces one aspect with its own and keeps the
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
  then builds the skill and runs Verification against the Criteria. **Open aspect:** any other. `enhance` runs each as a
  review.
- **K3. Family.** The aspect interfaces under `skill-design.aspects`, addressed by a wildcard. No interface is named for
  the family.
- **K4. Front door.** The `/skill` skill with the commands create, backfill, check, fix, and enhance.
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
| A1.3 | Skill author | Knows, for each aspect, whether a skill meets that aspect's criteria, with the skill left unchanged. |
| A1.4 | Skill author | Has the failures that check or the evals found repaired. |
| A1.5 | Skill author | Improves a skill that already passes, on the open aspects. |
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

## Open questions

- **Q1.** Autonomy by command. Direction: `backfill` and `fix` act more on their own; `create` and `enhance` propose and
  the author decides each item; `check` changes nothing. Customizing the `skill-design` references themselves needs no
  approval each time. What each default is, and where a user changes it, is not settled.
- **Q2.** Editing a skill that came from an installed plugin is allowed. Whether `/skill` first says that a plugin update
  will overwrite the edit is leaning yes, in one line.
- **Q3.** Whether skill distribution (`npx skills`) is an aspect of `skill-design`, or belongs to plugin distribution.
- **Q4.** Where the default eval loop and structural audit end and aced's BDD-style evals begin. The default is closer to
  `skill-creator`; aced's approach involves SDD.
- **Q5.** What a skill consumer, who uses a designed skill but never runs `/skill`, gets from `skill-design`. They are
  affected by the outcome, so they may be an actor, but no goal for them is settled.
