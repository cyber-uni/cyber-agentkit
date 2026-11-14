---
description: What an implementation of the Research aspect of /skill must contain - how create looks for prior art and checks feasibility before the Intent is final.
tags: [skill-design, aspect, research]
interface:
  cardinality: one
  version: 1
  sections:
    - {heading: Draft, required: true, holds: How create researches the drafted Intent, how much it does for a given skill, and what it records.}
    - {heading: Criteria, required: true, holds: The aspect's checks on a skill's research record, each with an ID and how it is decided.}
    - {heading: Fix, holds: How to repair each failed check.}
    - {heading: Enhance, holds: What to look for when suggesting better research.}
---

## Receives

The drafted Intent: the job, who asks for it, and the result. The skill's target harnesses, when the author named them.

## Produces

A durable research record, linked from the skill's `README.md` and not copied into it, or a recorded skip with its
reason. The record covers whether the job is real and stated correctly, whether every target harness can do what the
skill needs, and the existing skills for the job, each weighed against the Intent, ending in a recommendation to adopt,
extend, or build. The recommendation feeds back into the Intent before Criteria is drafted.

Research is an open aspect that `create` also runs: after the Intent draft and before Criteria. `check`, `fix`, and
`enhance` use it as they use any open aspect.

## Check format

As in `skill-design.aspects.criteria.interface`: `- **<ID>** [script|read|run] <statement>`, optionally with a
severity (`[read, warning]`), with `<ID>` `RES-<n>`.
