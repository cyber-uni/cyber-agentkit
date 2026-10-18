---
status: draft
name: agent-harness
project-path: packages/agent-harness
---

# agent-harness — detect an AI-agent harness, query what it holds, resolve layered references

> Root project spec, the **descriptive** top index for `@cyberuni/agent-harness` (the library at
> `packages/agent-harness`). Behaviors live in the node folders below. This spec starts as a backfill: only the
> `dependencies/` node is being specified; the other `src/` domains get a node when someone changes them.

## What this is

A TypeScript library that other agent tools (`universal-plugin`, `buddy-agent-harness`, `repobuddy`, `cyber-mux`)
share instead of each re-detecting harnesses. It detects which harness is running, reports what the harness holds
(managed-policy locations, plugin storage, installed and enabled plugins, skill naming), and resolves named
reference documents layered across managed, project, user, and plugin tiers. Every harness fact it encodes cites
`.research/harness-detection` or a later research topic; it never claims a harness it has not verified.

## Placement map

Strategy: **mirror-source**. A node mirrors one `src/` domain folder, down to the unit boundary only: a folder with a
testable surface becomes one behavioral node that owns its subtree. Cross-cutting concerns are `concept:` tags, never
a third folder level. Chosen because `src/` is already one folder per domain concept.

| A concept of kind | Lives in |
| --- | --- |
| a `src/<domain>/` library surface | `<domain>/` (one behavioral node) |
| a rule, model, or the why | `design/` (decisions in `design/decisions/`) |
| a shipped document generated from a domain's facts | its own `reference`-type node, named for the document |
| a flow across several domains | `workflows/` |
| a term used by more than one node | `glossary.md` |

Nodes so far: [`dependencies/`](./dependencies/README.md), the plugin dependency check; and
[`plugin-dependencies-reference/`](./plugin-dependencies-reference/README.md), the how-to document it generates.

<!-- BEGIN generated: by-concept (project-spec/concept-index) -->

## By concept

> Generated from `concept:` frontmatter by `project-spec/concept-index` — do not edit by hand.

<!-- END generated: by-concept (project-spec/concept-index) -->

<!-- BEGIN generated: by-concept (project-spec/concept-index) -->

## By concept

> Generated from `concept:` frontmatter by `project-spec/concept-index` — do not edit by hand.

| Concept | Facets |
|---|---|
| `plugin-dependencies` | `dependencies/` (behavior) · `plugin-dependencies-reference/` (reference) |

<!-- END generated: by-concept -->
