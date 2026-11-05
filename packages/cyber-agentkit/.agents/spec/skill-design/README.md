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

## Open questions

- **Q1.** Autonomy by command. Direction: `backfill` and `fix` act more on their own; `create` and `enhance` propose and
  the author decides each item; `check` changes nothing. Customizing the `skill-design` references themselves needs no
  approval each time. What each default is, and where a user changes it, is not settled.
- **Q2.** Editing a skill that came from an installed plugin is allowed. Whether `/skill` first says that a plugin update
  will overwrite the edit is leaning yes, in one line.
- **Q3.** Whether skill distribution (`npx skills`) is an aspect of `skill-design`, or belongs to plugin distribution.
- **Q4.** Where the default eval loop and structural audit end and aced's BDD-style evals begin. The default is closer to
  `skill-creator`; aced's approach involves SDD.
