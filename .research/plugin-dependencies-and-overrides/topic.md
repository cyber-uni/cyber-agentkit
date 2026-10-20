# Topic — Reference overrides and plugin dependencies

Investigation record for [#107](https://github.com/cyber-uni/cyber-agentkit/issues/107). The answers are in
[conclusion.md](./conclusion.md); each claim's source is in [evidence.md](./evidence.md).

## Question

Website work becomes layered: `repobuddy:website` stays a router whose `init`, `deploy`, and `update`
instructions are references; `unional-skills` and `cyber-agentkit` override them; `repobuddy` hard-depends on
the plugin that carries the `reference` skill. What must be true of the reference resolver, the dependency
manifests, the rename, and the docs for that to work?

## Method

1. Read the resolver source (`reference-layers.ts`, `resolve-reference.ts`, `reference-document.ts`) and its
   tests for tier order, merge mode, and cross-plugin `overrides`.
2. Build a fixture of three plugins holding one reference name and run the built `reference show --trace`
   through five cases: two unordered overriders, one overrider naming both, an overrider with no `overrides`
   key, a project copy with `merge-sections`, and a project copy with no `merge`.
3. Re-fetch the vendor sources behind E-CC-X1 and the "no dependency field" claims for Cursor, Agent Plugins
   (Codex, Copilot CLI) and Copilot CLI.
4. Read #101 for the rename order, `repobuddy`'s marketplace and manifest, and search the owner's repositories
   for dependents of the plugin name.

## Revision, 2026-10-18

The Council keyed overrides on the reference, not the plugin (R1 to R3 in the conclusion). The `overrides`
findings below describe what 0.7.1 does today; the design no longer relies on them. The revision re-checked
what the resolver has for a neutral name, an alias, a default marker, and a pin (E-OVR-8 to E-OVR-11).

## Findings

### Overrides (Q1)

The five fixture cases gave:

| Case | Result |
| --- | --- |
| `house` and `uak` each `overrides: [repobuddy]` | error, held by more than one plugin |
| `house` `overrides: [repobuddy, uak]` | `house` used over `uak` over `repobuddy`; merged sections |
| `house` with no `overrides` key | error, ambiguous |
| project copy `merge-sections` | project used; `house` and `repobuddy` still used below |
| project copy, no `merge` | project alone; both plugins `shadowed by project (first-wins)` |

The resolver therefore already implements "a plugin can contribute an override". What it does not do is let
a user exclude one of two enabled overriders; that is the `extends` question. Every selection a user needs for
this epic is reachable by enabling plugins, writing a project or user copy, or qualifying the name.

### Dependencies (Q3, Q4)

Claude Code is the only one of the four main harnesses with a dependency field, and its install flow
resolves a bare name in the declaring plugin's marketplace. Other harnesses ignore or reject the field, so
`repobuddy` there depends on the user following the docs. `cyber-agentkit` holds the harness facts, so a
reference generated from its dependency domain is the right home for the how-to-install text.

### Migration (Q2)

#101 plans the rename but not the dependency; `repobuddy` today only names the plugin in prose. The
dependency is a new hard requirement, so it comes after the rename and after `repobuddy` has moved to the new
name, and `repobuddy`'s marketplace has to list the plugin.

## Limits

Codex's dependency support rests on the closed Agent Plugins schema and the 2026-09-26 local scan, not a
fresh scan (E-DEP-5). Cross-marketplace behavior of a bare name declared by `cyber-asana` was not tested; the
docs say it resolves in the declaring plugin's own marketplace.
