---
description: What an implementation of the Verification aspect of /skill must contain - how a skill's eval cases and rubrics are written, run, and saved.
tags: [skill-design, aspect, verification, evals]
interface:
  cardinality: one
  version: 1
  sections:
    - {heading: Draft, required: true, holds: How create and skillify write the eval cases and one rubric per criterion.}
    - {heading: Cases, required: true, holds: Where the eval cases and rubrics live and their format.}
    - {heading: Run, required: true, holds: How test runs the cases - runs per case, threshold, sandbox, baseline - and the command that does it.}
    - {heading: Criteria, required: true, holds: The aspect's own checks on a skill's eval cases, each with an ID and how it is decided.}
    - {heading: Fix, holds: How to repair each failed check.}
    - {heading: Enhance, holds: What to look for when suggesting better cases or rubrics.}
---

## Receives

The skill's Intent, its Criteria with their IDs, its Trigger description, and the near misses Trigger listed.

## Produces

Trigger cases (requests that should and should not fire the skill), outcome cases (sample inputs to run the skill on),
and one rubric per Criteria ID. In `test`, it runs them and writes the result in the shape the `test` command of
`/skill` defines, which `fix`, `enhance`, and the next `test` read. A rubric that needs a judge runs only when the
author names one; otherwise that criterion is reported as not tested.

## Check format

As in `skill-design.aspects.criteria.interface`: `- **<ID>** [script|read|run] <statement>`, with `<ID>` `VER-<n>`.
