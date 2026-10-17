---
title: Reference documents
description: How agent-harness resolves a named reference document across the managed, project, user, and plugin tiers, and how an override merges with the layers below.
---

A reference is a named Markdown document an agent reads on demand, such as a checklist or a set of
weights a skill applies. A plugin ships the default. A project or a person can override it without
editing the plugin.

```ts
import { loadReference } from '@cyberuni/agent-harness'

const resolved = await loadReference('agent-readiness-weights', {
	root: process.cwd(),
	plugin: { name: 'my-plugin', root: pluginRoot },
})
if (resolved.status === 'found') console.log(resolved.content)
```

From a shell, or from an agent:

```sh
npx -y @cyberuni/agent-harness reference show agent-readiness-weights
```

## The reference command

| Subcommand | Does |
| --- | --- |
| `show <name>...` | Prints each reference; `--trace` says why the name resolved to the copy it did |
| `list [pattern]` | Every layer, and every reference at each layer that holds it, marked used or shadowed; a pattern such as `project-tracker.capabilities.*` keeps only the names it matches exactly |
| `search <query>` | References matching a query by name, description, tags, heading, or body |
| `where <name>` | The project and user files an override can be written to |
| `create <name>` | Starts a reference in the project or user tier, marked `merge-sections` when it overrides a copy below |
| `delete <name>` | Deletes the project or user copy, and reports which copy answers the name afterwards |
| `implementations <id>` | The implementations of an [interface](/agent-harness/concepts/reference-interfaces/), and the ones left out with why |
| `check [name]...` | Checks references against their [interface](/agent-harness/concepts/reference-interfaces/); exits 1 on any failure |

`create` and `delete` take `--scope project` (the default, `.agents/references/`) or `--scope user`
(`~/.agents/references/`), and `--dry-run` to print what they would do. Neither ever writes to a
plugin's or a managed folder: `delete` refuses a name with no copy in its scope, and names the copy
that answers instead. Deleting a project override brings back the copy below it, such as the
plugin's.

## The reference skill

The package is also an agent plugin, `cyber-agent-harness`, that ships a `reference` skill. Type
`/reference` (`/cyber-agent-harness:reference` in Claude Code) to run it.

| Mode | When |
| --- | --- |
| Load | another skill names references to load with this skill |
| Create | writing a new reference for a project, for the user, or for a plugin to ship |
| Update | changing a reference: the user's own in place, a plugin's by an override |
| Delete | removing a project or user copy, after saying which copy answers the name then |
| Find | `search` for a topic, or `list` every reference |
| Inspect | `show`, `show --trace`, or `where` |
| Wire a skill | giving a skill the line that loads a reference |

The skill shows each file and its path, and writes or deletes it only on your approval. It never
edits or deletes a reference a plugin ships; it writes an override instead. Load runs only the
skill's bundled `scripts/reference.mjs`, never a package runner.

A skill loads a reference by naming it in one line:

```text
Load `agent-readiness-weights` with the `reference` skill in the `cyber-agent-harness` plugin.
```

## Where a reference is read from

Layers are read highest precedence first.

| Tier | Folders |
| --- | --- |
| managed | The admin `references/` folder (`/etc/buddy-agent-harness/references` on Linux), and a `references/` beside each detected harness's managed-policy files |
| project | `.agents/references/` in the root and each folder above it, up to the repository root |
| user | `~/.agents/references/` |
| plugin | The calling plugin's `references/`, each plugin the harness has enabled, then each package the project's `package.json` declares |

Within a folder, `<name>.md` answers first, then `<name>/README.md`, `<name>/index.md`, and
`<name>/SKILL.md`.

Plugins are alternatives, not a stack. When two plugins hold the same name and resolution reaches
the plugin tier, the result is `ambiguous`; ask for `<plugin>/<name>` instead. A plugin's copy can
declare that it sits above another plugin's with `overrides`; see
[Overriding another plugin](/agent-harness/concepts/reference-interfaces/#overriding-another-plugin).

A plugin layer is read only for a plugin the harness has enabled, or a package the project
declares. Installing a plugin never adds a layer, because a reference is instruction text an agent
follows.

## How layers combine

The frontmatter `merge` key says how a document combines with the layers below it.

| `merge` | Effect |
| --- | --- |
| `first-wins` (default) | Replaces every layer below |
| `combine` | Placed above the layers below, each kept whole |
| `merge-sections` | Replaces the sections it redefines, matched by heading path, and keeps the rest |

Under a heading in a `merge-sections` document, a comment changes how that one section applies:

```md
## Weights
<!-- merge: combine -->

- Tests: 30
```

`<!-- merge: combine -->` appends to the section below, and `<!-- merge: remove -->` deletes it.
Give each topic its own `##` section: a single `#` title would hold every section under it.

## Frontmatter

Frontmatter is read as YAML. The resolver reads `merge`, `description` (shown by `list` and
`search`), `tags` (matched by `search`), and `overrides`. `check` and `implementations` read
`interface` and `implements`. `resolved.metadata` holds every key, the higher layer
winning. Frontmatter that is not a YAML mapping is ignored with a warning.
