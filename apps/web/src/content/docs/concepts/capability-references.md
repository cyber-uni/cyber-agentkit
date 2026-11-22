---
title: Capability references and blueprints
description: A capability reference says what one system can do; a blueprint says one way to fulfill a skill's interface on that system, building on it. Capability references, blueprints, and the doctor are built; the registry is planned.
---

:::note[Partly built]
This design is accepted ([cyber-agentkit#366](https://github.com/cyber-uni/cyber-agentkit/issues/366)). Each part is
marked here as it ships.

- **Built:** capability references and the `**Partial.**` mark
  ([cyber-agentkit#376](https://github.com/cyber-uni/cyber-agentkit/issues/376)), blueprints
  ([cyber-agentkit#377](https://github.com/cyber-uni/cyber-agentkit/issues/377)), and the doctor
  ([cyber-agentkit#378](https://github.com/cyber-uni/cyber-agentkit/issues/378)).
- **Planned:** the registry of capability references.
:::

A skill that works with an outside system, such as an issue tracker, needs to know two things it should not carry
itself:

- **What the system can do.** Which features it has, from which version or tier, and what was found by actually
  running it.
- **How to do the skill's operations on it.** The commands for search, create, link, and so on.

The reference system keeps these in two kinds of [reference](/cyber-agentkit/concepts/reference-documents/):

| Kind | Says | Named | One per |
| --- | --- | --- | --- |
| capability reference | what one system can do | `<system>.capabilities` | system |
| blueprint | one whole way to fulfill a skill's interface on one system | `<interface>.<system>.<solution>` | way of using the system |

A system can have several blueprints. Asana, for example, can model a tracker's levels as sections, as a custom
field, or as parent tasks. Each of those is a blueprint, and all three build on one `asana.capabilities`, so the facts
about Asana are written once.

A system is anything a skill operates through commands or an API, remote or on the machine: a tracker, a code host, a
service, or a tool such as `gh` or `docker`. A harness is not one; this package's own harness detection covers it.

## A capability reference

`asana.capabilities.md` opens with three sections, in this order, and then one section per feature. The values in
these examples are illustrative, not verified facts about Asana.

```md
## System

Asana, a work-management service. Docs: https://developers.asana.com/docs
Covers: the Starter and Advanced tiers. Needs: `curl`, and a personal access token.

## Detect

The repository's routing names Asana. Asana is never picked from the git remote.

## Verified

- Advanced: run, 2026-11.
- Starter: from docs, never run.

## Custom fields

**Partial.** Starter allows custom fields only on paid workspaces.
Since: Starter (paid workspaces).

## Portfolios

**Unsupported.** Starter has no portfolios.
Since: Advanced.
```

- **System** names the system, links its docs, and says which versions or tiers the reference covers.
- **Detect** says how a skill tells this system is the one in use.
- **Verified** says, for each version or tier, whether the reference was `run` against it, follows the docs
  (`from docs`), or is `untested`, and when.
- **A feature section** may open with `**Partial.**` or `**Unsupported.**` and one sentence, and may carry
  `Since:` and `Until:` lines.

Start one with the three opening sections stubbed, each saying what it holds:

```sh
npx -y cyber-agentkit reference create asana.capabilities --plugin <plugin folder>
```

`reference check` reads only its shape. It fails a capability reference whose first three sections are not System,
Detect, and Verified in that order, one that declares `implements`, and a `**Partial.**` or `**Unsupported.**` mark
with no sentence after it, in any reference. It never judges what a section says.

A capability reference takes no plugin prefix: the system is its namespace, so `asana.capabilities`, not
`cyber-asana.asana.capabilities`. Its `<system>` is one segment, with no dot.

Keep it thin. The system's docs already cover general behavior, so link them. A capability reference earns its place
by holding what a search cannot find: the facts a skill decides on, how your setup differs, and what running it showed.

## A blueprint

A skill that wants to work on any system publishes a **blueprint interface**, an
[interface](/cyber-agentkit/concepts/reference-interfaces/) whose id ends in `.blueprints`, such as
`project-tracker.blueprints`. Each blueprint implements it for one system, one whole way:

```md
---
implements: project-tracker.blueprints@1
---

## Create

Needs: Custom fields

`curl -X POST https://app.asana.com/api/1.0/tasks ...`

## Retype

**Partial.** Moving an epic to an initiative recreates it; its comments stay on the old task.
Workaround: link the old task from the new one.
```

Its name, `project-tracker.blueprints.asana.custom-field`, says the system (`asana`), so its capability reference is
`asana.capabilities`. Its `Needs:` lines name that reference's features, comma-separated, as their headings read.

Start one from the interface's stub, then add the `Needs:` lines:

```sh
npx -y cyber-agentkit reference create project-tracker.blueprints.asana.custom-field \
  --implements project-tracker.blueprints --plugin <plugin folder>
```

`reference check` fails:

- a blueprint interface whose cardinality is not `many`;
- a blueprint whose capability reference cannot be found. When another plugin ships it, list that plugin as a
  dependency;
- a blueprint whose `Needs:` line names a feature its capability reference has no section for.

Like any `many` implementation, a blueprint is `<id>.<key>`; its key is `<system>.<solution>`, and `check` fails a
blueprint whose name has no solution.

A blueprint describes one whole solution, because choices inside it often depend on each other. When its author knows
a choice is independent of the rest, such as how sprints are modeled, that choice can be a reference of its own that
the blueprint loads by name.

The user picks a blueprint the way they pick any implementation: `reference implementations project-tracker.blueprints`
lists each one with its system, its capability reference, that reference's Verified entries, and which sections are
partial or unsupported. A blueprint whose capability reference cannot be found is left out, with the reason; add
`--trace` to see it.

## When your setup differs

Customize the capability reference, not the blueprints. A team on a self-hosted GitLab tier without epics marks the
`Epics` feature unsupported in `gitlab.capabilities` for the repository. Every blueprint that needs `Epics` is then
flagged when loaded here, with no change to any blueprint: `reference load` returns the blueprint with a
`feature-unsupported` warning naming the section and the feature, such as
`section Create needs Epics, which gitlab.capabilities marks **Unsupported.** here`. `reference check` reports the same
warning and does not fail on it.

A blueprint whose capability reference is missing still loads, with a warning. Loading reads files only: it runs no
command and compares no version.

## Examine the system: the doctor

`reference check` reads a capability reference as written. The doctor examines the system it describes, as it runs
on this machine:

```text
/reference doctor gitlab.capabilities
```

It is a mode of the `reference` skill. The agent shows each command the reference's Detect names, then runs the ones
that only read, such as `glab --version`. Those commands are the reference author's, so a command that would change
something is listed as not run. The report gives:

- the capability reference, and the tier and plugin that answered it, saying so when a local patch applies;
- the version and tier found, or that the system was not detected or a needed tool is missing, in which case no
  feature is compared;
- each feature that disagrees: what was found is outside its `Since:` and `Until:` lines while the section is not
  marked `**Unsupported.**`, or inside them while it is marked `**Unsupported.**` or `**Partial.**`;
- the Verified entry that covers what was found, or that none does, so the reference is unverified for it.

The doctor changes no file. Its report leaves out local paths, hosts, and tokens, so it can be sent to the author as
is. A name that is not a capability reference is an error, and nothing runs.

Authors run the doctor against their own system before they update Verified.

## When a step fails

Nothing compares versions while a skill runs. When a step fails while following a blueprint, the `reference` skill's
load procedure has the agent name the blueprint and its capability reference, and offer to:

1. run the doctor on that capability reference;
2. report to the author, with the doctor's report as the body, at the repository the plugin's manifest names, or
   without a link when it names none;
3. patch the capability reference for this repository in the meantime, marking what this system lacks
   `**Unsupported.**`, so every blueprint that needs it warns when loaded here.

It makes none of these without the user's yes.

See [reference file naming](/cyber-agentkit/concepts/reference-file-naming/) for every file form, and the
[design record](https://github.com/cyber-uni/cyber-agentkit/blob/main/packages/cyber-agentkit/.agents/spec/design/decisions/0008-capability-references-and-blueprints.md)
for why it is shaped this way.
