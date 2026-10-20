---
status: draft
name: cyber-agentkit
project-path: packages/cyber-agentkit
---

# cyber-agentkit — fundamental agent features that work across harnesses

> Root project spec, the **descriptive** top index for `cyber-agentkit` (the package at `packages/cyber-agentkit`).
> Behaviors live in the node folders below. This spec starts as a backfill: only the `dependencies/` node is being
> specified; the other `src/` domains get a node when someone changes them.

## What this is

An agent-harness-agnostic toolkit. It provides the fundamental features an agent tool needs, and makes each one work
the same way on every harness, so the tools built on it (`universal-plugin`, `buddy-agent-harness`, `repobuddy`,
`cyber-mux`) do not each re-solve them per harness.

Today those features are: knowing which harness is running and what it holds (managed-policy locations, plugin storage,
installed and enabled plugins, skill naming, headless runs); checking the plugins another plugin depends on; resolving
named reference documents layered across managed, project, user, and plugin tiers; and leasing git worktrees to
concurrent sessions. It ships as a library, a command line, and an agent plugin. Every harness fact it encodes cites
`.research/harness-detection` or a later research topic; it never claims a harness it has not verified.

## Placement map

Strategy: **mirror-source**. A node mirrors one `src/` domain folder, down to the unit boundary only: a folder with a
testable surface becomes one behavioral node that owns its subtree. A document the domain ships, generated from its
facts, is a section of that node, not a node of its own. Chosen because `src/` is already one folder per domain concept.

| A concept of kind | Lives in |
| --- | --- |
| a `src/<domain>/` library surface | `<domain>/` (one behavioral node) |
| a rule, model, or the why | `design/` (decisions in `design/decisions/`) |
| a term used by more than one node | `glossary.md` |

Nodes so far: [`dependencies/`](./dependencies/README.md), the plugin dependency check and the how-to document it
generates; [`reference/`](./reference/README.md), loading the instructions a skill names, composed from the tiers that hold
them (draft; its child specs are resolve, write, interfaces, and skill).
