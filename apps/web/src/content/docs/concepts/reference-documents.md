---
title: Reference documents
description: How cyber-agentkit composes a named reference document from the contributions in the managed, project, user, plugin, and default tiers, and how a contribution says what it builds on and how it applies.
---

A reference is a named Markdown document an agent reads on demand, such as a checklist or a set of
weights a skill applies. A skill asks for it by name, such as `project-tracker.capabilities.github`,
and gets exactly that. Whoever places a contribution for the name decides what it says: a plugin
ships one, a skill ships its default, and a repository, a user, or a machine-wide policy can each
add their own without forking the plugin.

```ts
import { loadReference } from 'cyber-agentkit'

const resolved = await loadReference('agent-readiness-weights', {
	root: process.cwd(),
	plugin: { name: 'my-plugin', root: pluginRoot },
	defaultSkill: skillFolder,
})
if (resolved.status === 'found') console.log(resolved.content)
```

From a shell, or from an agent:

```sh
npx -y cyber-agentkit reference show agent-readiness-weights
```

## The reference command

| Subcommand | Does |
| --- | --- |
| `show <name>...` | Prints each reference, composed from its contributions; `--trace` says how it was built |
| `list [pattern]` | One row per name, with its description, and its status when not found; `--trace` adds a row per layer holding it |
| `search <query>` | References matching a query by name, description, tags, heading, or body |
| `where <name>` | The project and user files a customization is written to, and the heading paths below each |
| `create <name>` | Starts a contribution, with `merge: patch` unless `--merge` says otherwise |
| `select <name> <option>...` | Writes the `extends` that picks what a name builds on |
| `delete <name>` | Deletes a project or user contribution, and reports what answers the name afterwards |
| `implementations <id>` | The implementations of an [interface](/cyber-agentkit/concepts/reference-interfaces/) a consumer can load |
| `check [name]...` | Checks references against their [interface](/cyber-agentkit/concepts/reference-interfaces/); exits 1 on any failure |

`create`, `select`, and `delete` act on the project tier by default (`.agents/references/` at the
root) or the user tier with `--scope user` (`~/.agents/references/`). `create` and `delete` also
take `--plugin <plugin folder>` or `--default <skill folder>`, for a plugin's or a skill's source in
the repository. They never write to a managed folder or an installed copy of a plugin or skill.
`--dry-run` prints what `create` or `delete` would do. The read-only subcommands change no file.

## The reference skill

The package is also an agent plugin, `cyber-agentkit`, that ships a `reference` skill. Type
`/reference` (`/cyber-agentkit:reference` in Claude Code) to run it.

| Mode | When |
| --- | --- |
| Load | another skill names references to load with this skill |
| Create | writing a new contribution for a project, for the user, or for a plugin or skill to ship |
| Update | changing what a name says: editing your own contribution, or adding one above a plugin's |
| Select | choosing which plugins, or the default, a name builds on, which settles an ambiguous name |
| Delete | removing a project or user contribution, after saying what answers the name then |
| Find | `search` for a topic, or `list` every reference |
| Inspect | `show`, `show --trace`, or `where` |
| Wire a skill | giving a skill the line that loads a reference |

The skill shows each file and its path, and writes or deletes it only on your approval. It never
edits a contribution a plugin ships; it writes one above it instead. Load runs only the skill's
bundled `scripts/reference.mjs`, never a package runner.

A skill loads references by naming them in one line:

```text
Load `agent-readiness-weights` and `release-checklist` with the `reference` skill of `cyber-agentkit`.
```

## Where contributions are read from

A name may have a contribution in several layers. The tiers, listed from highest to lowest:

| Tier | Folders |
| --- | --- |
| managed | `references/` beside each detected harness's managed-policy files |
| project | `.agents/references/` in the root and each folder above it, up to the repository root; the nearer folder is higher |
| user | `~/.agents/references/` |
| plugin | The calling plugin's `references/`, each plugin the harness has enabled, then each declared dependency of the nearest `package.json` that has a plugin manifest |
| default | `<skill folder>/references/<name>.default.md` of the skill loading the name, given by `--default <skill folder>` |

Within a folder, only `<name>.md` and `<name>/README.md` answer a name, in that order. A
`<name>.default.md` in a tier folder is ignored with a warning: a default goes in a skill's
`references/` folder.

A plugin is named by the `name` in its plugin manifest, never by its npm package name. A plugin
layer is read only for a plugin the harness has enabled, or a package the project declares that has
a plugin manifest. Installing a plugin never adds a layer, because a reference is instruction text
an agent follows.

`list`, `search`, and `check` also find skills' defaults in the skill folders the detected harness
reads: its project and user skill folders, its machine-wide admin skill folders, and each enabled
plugin's skills. This covers Claude Code, Cursor, Codex, GitHub Copilot CLI, OpenCode, and Gemini
CLI. A skill is known by the `name` in its `SKILL.md`, not by its folder's name, and a symlinked
skill folder is followed, so skills that pnpm or `npx skills` linked are found. On another harness,
the answer says why no default is listed.

## How contributions compose

Contributions apply bottom first, each over the result of everything below it:

1. The stack: the plugins and the default, in the order `extends` gives them.
2. The user contribution.
3. The project contributions, from the repository root down to the root.
4. The managed contributions.

A higher contribution wins where they conflict.

### Operations

Frontmatter `merge` says how a contribution applies over what is below it.

| `merge` | Effect |
| --- | --- |
| `patch` (default) | Keeps what is below, and puts each section's text in place of the text it matches by heading path |
| `combine` | Keeps what is below, and adds each section's text after the text it matches |
| `replace` | Drops everything below |
| `remove` | Drops everything below; its body is ignored with a warning |

A heading path is read from each document's own top heading level, so `# Review` and `## Review`
match. Under `patch`, a section with empty text keeps the text below, and a section that matches
nothing is added at the end. Its subsections replace the ones they match, and the others are kept.
Under `combine`, the lower text comes first, subsections combine too, and the document says once
that where combined text conflicts, the later text wins.

A contribution with no body changes nothing, except with `remove`. When a `remove` is the last
contribution with an effect, the name is `missing`, and the trace names the `remove`.

A marker under a heading applies one operation to that section alone; a section with no marker takes
its document's operation:

```md
## Weights
<!-- merge: combine -->

- Tests: 30
```

An unknown `merge` value or marker is read as `patch`, with a warning. A marker that matches no
section below warns, and its text goes at the end.

### What a contribution builds on

Frontmatter `extends` lists what a contribution builds on, bottom first: plugins by their manifest
name, and `default` for the loading skill's default.

```md
---
extends: [default, repobuddy, house-style]
---
```

- The highest `extends` written in the managed, project, or user tier builds the stack. A plugin or
  the default it leaves out is not used.
- Each step brings its own `extends` beneath it. A step can carry its own keys:
  `- house-style: {merge: combine, extends: []}`, or `house-style: combine` for just the operation.
- With no written `extends`, the plugins' own `extends` order them, and the default is lowest.
  Plugins that nothing orders make the name `ambiguous`, with each `<plugin>/<name>` and the default
  as options.
- A step not installed, or not holding the name, is skipped with a warning. When every step is
  missing, the `extends` counts as not written.
- When a plugin answers over the loading skill's default and no `extends` names either, the name
  still answers, with a warning that names `reference select`.

A contribution with `extends` and no body is a selection: it picks the stack and changes nothing
else. `reference select <name> <option>...` writes one, and `--clear` removes it:

```sh
npx -y cyber-agentkit reference select project-tracker.capabilities.github repobuddy house-style
```

A qualified name, `<plugin>/<name>`, builds that plugin's own stack. A written `extends` is not used
for it, and managed, project, and user contributions still apply over it.

## Names and statuses

A name is letters, digits, `-`, and `.`, optionally after `<plugin>/`. A name that ends `.md` or
`.default`, is a path, or has another character is `invalid`. Nothing is read for it, and the other
names still resolve.

| Status | Code | Means |
| --- | --- | --- |
| `found` | | The composed document |
| `missing` | `reference-missing` | No contribution answers, a qualified name's plugin is not installed, or a `remove` turned it off |
| `ambiguous` | `reference-ambiguous` | The contributions cannot be put in one order; `options` lists the choices |
| `invalid` | `reference-invalid` | It is not a reference name |

## Output

Output is agent-first: a command prints only the fields that answer it.

- `show --format json` gives each found name's content as a string. A name not found, or one with
  warnings, is a record.
- `--metadata` makes every entry a record, with its `status` and `metadata`: the composed
  frontmatter, the higher contribution winning each key, without `merge` and `extends`.
- `--trace` adds the trace. It shows the stack and what built it, the contributions behind each
  section, and every layer checked with its frontmatter as written, its operation, and its outcome.
  The trace also names the detected harnesses.

Every warning is `{code, message}`; the code is stable and the wording is not. In text, a failure
prints on stderr as `error: <code>: <message>` and a warning as `warning: <code>: <message>`.
Several names print as `<reference name="...">` blocks, in the order asked.

The command exits 0 when every name is found, 1 when one is not or a write is refused, and 2 on a
usage error.

## Frontmatter

Frontmatter is read as YAML. The resolver reads `merge` and `extends`; `list` and `search` show
`description`, and `search` also matches `tags`. `check` and `implementations` read `interface` and
`implements`. Frontmatter that is not a YAML mapping is ignored with a warning.
