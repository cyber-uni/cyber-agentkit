---
description: What an implementation of the Criteria aspect of /skill must contain - how a skill's Criteria are drafted, checked, repaired, and improved.
tags: [skill-design, aspect, criteria]
interface:
  cardinality: one
  version: 1
  sections:
    - {heading: Draft, required: true, holds: How create and backfill write a skill's Criteria from its approved Intent.}
    - {heading: Criteria, required: true, holds: The aspect's own checks on a skill's Criteria, each with an ID and how it is decided.}
    - {heading: Fix, holds: How to repair each failed check.}
    - {heading: Enhance, holds: What to look for when suggesting a better set of Criteria.}
---

## Receives

The skill's approved Intent, and in `backfill` the source it is drawn from.

## Produces

The skill's Criteria: boolean statements about the skill's result, each with an ID `C<n>`, written where the agent
running the skill reads them before it reports done. Verification writes one rubric per Criteria ID, so the IDs never
change meaning; a removed criterion retires its ID.

## Check format

Each item under `## Criteria` is one check: `- **<ID>** [<how>] <statement>`. `<ID>` is `CRI-<n>`. `<how>` is
`script` when a script decides it from the files alone, `read` when an agent decides it by reading the skill, or `run`
when only running the skill decides it, which `/skill check` reports as not checked and points to `test`.
