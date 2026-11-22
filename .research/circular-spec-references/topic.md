# Do circular references between specs confuse LLM agents? (November 2026)

## Question

Is there evidence that mutual or circular references between documents an agent reads (specs,
skills, instructions) degrade the agent's comprehension or task accuracy, or cause loops or drift?
The answer decides whether [ADR-0021](https://github.com/cyberuni/cyber-sdd/blob/main/docs/adr/0021-spec-dependency-kinds.md) in cyber-sdd (spec dependency kinds) applies to SDD v2 as well as v1.

## Scope

In scope: comprehension cycles (A cannot be understood without B and B without A), mutual
cross-references between instruction/spec/skill documents, cyclic includes in agent config,
multi-document reasoning when documents depend on each other.
Out of scope: runtime invocation recursion between programs unrelated to reading documents;
general long-context degradation unless tied to inter-document dependency.

## Source angles

- A1 Research literature: LLM multi-document / multi-hop reasoning, circular definitions, interdependent context.
- A2 Practitioner evidence: agent harness issues, incidents, docs on cyclic references in skills, rules, AGENTS.md, includes.
- A3 Local evidence: cyber-sdd and sibling repos (history, research dossiers, incidents behind ADR-0021).

## Findings

### No direct measurement

No source measures a comprehension cycle ([E301](evidence.md), [E306](evidence.md); literature and
practitioner searches negative).

### The cost is the dependency

Dispersed evidence and hop depth lower accuracy (E102, E103); nested references get partial reads
(E201). Both apply to any one-way comprehension dependency. Length confounds them (E104).

### Loops are at invocation

Unguarded skill self-invocation loops (E204, E205). ADR-0021 already requires a termination guard.

## Contradictions

- None between sources. Anthropic's "one level deep" (E201) and Claude Code's four-hop imports (E202)
  cover different loading paths.

## Open questions

- Does a cycle cost more than two one-way comprehension dependencies? Needs a controlled eval.
- Do two-sided boundary references help or hurt?
- Cursor, Cline, Aider, Spec Kit, and Kiro trackers were not searched (GitHub rate limit).

## Sources consulted

See [evidence.md](evidence.md).
