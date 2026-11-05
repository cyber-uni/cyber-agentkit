---
spec-type: behavioral
status: draft
---

# skill-design: a skill author designs a skill through aspects they can swap one at a time

**Outcome:** an author, human or agent, creates, checks, fixes, and enhances a skill by running `/skill`. Each step of
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
front door, `/skill`, with four commands: create a skill, check one against what each aspect must produce, fix what
check or the evals found, and enhance one beyond that. A team or plugin replaces one aspect with its own and keeps the
rest.
