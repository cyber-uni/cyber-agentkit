# Conclusion — Do circular references between specs confuse LLM agents?

## Last updated

2026-11-21 (first pass).

## Question

Is there evidence that mutual or circular references between documents an agent reads (specs,
skills, instructions) degrade comprehension or task accuracy, or cause loops or drift? Decides
whether [ADR-0021](https://github.com/cyberuni/cyber-sdd/blob/main/docs/adr/0021-spec-dependency-kinds.md) in cyber-sdd (spec dependency kinds) applies to SDD v2 as well as v1.

## Verdict

Not established. No paper, benchmark, issue thread, or local incident measures a comprehension
cycle (A cannot be understood without B, and B not without A). ADR-0021's acyclic rule rests on
the analogy to the code rule, not on an observed agent failure (E301, E306).

The adjacent evidence points at the dependency, not the cycle. Accuracy drops as the facts a task
needs spread over more places and hops (E102, E103), and Anthropic reports that Claude reads
nested references partially (E201). Both costs fall on any spec that needs another to be
understood. A cycle is two such dependencies; nothing shows it costs more than two one-way ones.

Real loops exist at invocation, not reading: a skill re-invoking itself spawned about 102
subagents (E204), and circular skill calls burn tokens until timeout (E205). ADR-0021 already
allows invocation cycles only with a termination guard.

No evidence either way on self-contained two-sided boundary references, which ADR-0021 permits.

## Reference material

| Reference kind (ADR-0021) | Evidence of agent harm | Where |
|---|---|---|
| Comprehension cycle | None direct; adjacent cost of any comprehension dependency | E102, E103, E201 |
| Production-order cycle | Not researched (a scheduling fact, not a reading one) | none |
| Invocation cycle | Yes, unguarded self-invocation loops | E204, E205 |
| Boundary / routing (two-sided) | None for or against | none |

## Confidence

Medium that no direct evidence exists (three angles, all negative; the practitioner angle was
rate-limited on GitHub search). Low on any transfer from the adjacent evidence to cycles.

## Strongest supporting evidence

- E201: Anthropic's skill guide: references more than one level deep get partial reads.
- E102, E103: multi-hop accuracy is bounded by the least visible evidence and falls with hop depth.
- E204: reproduced unbounded skill self-invocation in Claude Code.

## Strongest weakening or contradictory evidence

- E104: length alone degrades performance, so any cost of a cycle is confounded with added tokens.
- E301, E306: the repo's own rule cites no incident; the incidents it cites are rename drift (E303).

## What is not supported

- That a cycle confuses an agent more than two one-way comprehension dependencies.
- That two-sided boundary references help or hurt.

## Where evidence is thin

Practitioner trackers for Cursor, Cline, Aider, Spec Kit, Kiro were not searched (rate limit).
Several literature entries come from search summaries, not full papers (E107 to E109 unverified).

## What should be checked again later

- A controlled eval: the same task with A and B as a cycle, as one-way, and as one merged spec.
- A rerun of the practitioner search once the GitHub rate limit clears.
