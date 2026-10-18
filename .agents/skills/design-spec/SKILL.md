---
name: design-spec
description: Use this skill when writing, revising, or reviewing a design spec, the document that states what a capability must do (intent, use cases, and criteria on the outcome) before or alongside its code. Also use it for requests like "spec this feature", "write the spec for X", "is this spec good", or "review the spec", and before deriving tests from a spec.
---

# Design spec

A **design spec** fixes what a capability must do, in terms an outsider can check without reading the code. It is a
pair: **intent** (what the capability is for, argued with) and **criteria** (what must be true of the outcome,
evaluated). Intent without criteria cannot be checked. Criteria without intent cannot be questioned when they turn
out to encode the wrong goal.

This skill is spec-anchored: the spec stays and is compared against on every change. It is not scaffolding discarded
after the build. Its rationale and sources are in `.research/design-spec-criteria`.

## Route

| The request | Mode |
| --- | --- |
| write a spec for a capability, or backfill one for existing code | [Write](#write) |
| change what an existing spec says | [Write](#write), then [Review](#review) the changed parts |
| judge a spec, or decide whether it is ready | [Review](#review) |
| derive tests from a spec | [Derive tests](#derive-tests) |

## Write

Put one capability in one folder: `README.md` holds the spec, `graph.md` holds the decision graph when the
behavior branches. Write these sections of `README.md`, in order. Keep each as short as it can be.

1. **Title and outcome.** One sentence naming the single outcome.
2. **What.** The problem, who has it, and the intent. Legible to a non-engineer.
3. **Non-goals.** Plausible goals this capability excludes. "Must not crash" is not a non-goal.
4. **Key terms.** Each term a criterion leans on, defined once.
5. **Actors and goals.** Every actor, then the result each wants. Include people affected by the outcome who never
   invoke it; a missed use case usually hides there. Derive use cases from actors, never by walking the interface.
6. **Use cases.** One per actor goal: trigger, inputs, success outcome, and **extensions**, every path from the
   trigger that does not reach the goal. A use case with no extensions says `extensions: none, <why>`.
7. **Criteria.** A list of boolean statements about the outcome, one per line, each with a stable ID and bound to a
   use case and, where a graph exists, to an edge in it.
8. **Open questions.** What is unresolved, marked. Empty before the spec is ready.
9. **References.** Links to rationale, sibling specs, and the home of any shared fact.

Leave out implementation design, task lists, stack choices, and alternatives analysis. Link rationale (an ADR, an
issue, a research topic) and do not copy it in.

**Why the rationale is linked, not inlined.** An agent loads the spec on every task, so every line costs tokens every
time. Rationale is read only when someone questions a criterion, and it decays on a different clock from the
criteria. Keep it in one linked home and the spec stays small and current. The same holds for this skill: it states
the bar and links the reasons.

**Design spec versus functional spec.** The design spec states what a consumer of the capability is judged against:
names, flags, exit codes, error codes, stated outcomes. Be specific there. Internal contracts, module behavior, and
scenarios belong in the functional spec co-located with the implementation. Test: if a consumer would notice the
change, it is a criterion here. Otherwise it is not.

**Notation.** The design spec names no scenario form. Use cases and criteria are the contract. A use case may carry
Gherkin or EARS for one scenario when it clarifies; the functional spec or test plan owns the form of the rest.

**Decision graph.** When the behavior branches, draw the decisions in `graph.md` (see
[decision graph](references/decision-graph.md)) and cite its edge IDs from the criteria. Omit it for a spec that
states facts or a table.

## Review

Load [the criteria](references/criteria.md) and judge the spec against C1 to C9 in the order given there. Report each
criterion as pass or fail with the line that fails it. A spec is ready when none fails. Do not rewrite a failing
spec in the same pass unless asked; say what is wrong and what would fix it.

## Derive tests

Build tests from the criteria list, one test or group per criterion ID, as native, deterministic tests of the
project's own test stack. Do not write a feature file for an agent to run: an agent running prose scenarios spends
tokens on every run and cannot be relied on to follow them. A criterion that cannot become such a test fails C5;
send it back to Write instead of guessing.
