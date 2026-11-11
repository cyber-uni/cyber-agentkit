---
description: What an implementation of the Security aspect of /skill must contain - the checks that a skill is safe to share and to run.
tags: [skill-design, aspect, security]
interface:
  cardinality: one
  version: 1
  sections:
    - {heading: Criteria, required: true, holds: The aspect's checks on a skill, each with an ID and how it is decided.}
    - {heading: Fix, holds: How to repair each failed check.}
    - {heading: Enhance, holds: What to look for when suggesting a safer skill.}
---

## Receives

The skill's folder: `SKILL.md` and every file beside it.

## Produces

A pass, a fail, or a not checked for each check. Security is an open aspect: `create` does not walk it, and `check`,
`fix`, and `enhance` do.

## Check format

As in `skill-design.aspects.criteria.interface`: `- **<ID>** [script|read|run] <statement>`, with `<ID>` `SEC-<n>`.
