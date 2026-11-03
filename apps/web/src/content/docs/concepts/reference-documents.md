---
title: Reference documents
description: How cyber-agentkit composes a named reference document from the contributions in the managed, repo, user, plugin, and default tiers, with a project section for each folder, and how a contribution says what it builds on and how it applies.
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
npx -y cyber-agentkit reference load agent-readiness-weights
```

## The reference command

| Subcommand | Does |
| --- | --- |
| `load <name>...` | Prints each reference, composed from its contributions, then its project sections; `--trace` says how it was built |
| `list [pattern]` | One row per name, with its description, and its status when not found; `--trace` adds a row per layer holding it |
| `search <query>` | References matching a query by name, description, tags, heading, or body |
| `where <name>` | The files a customization is written to, what hides each, and the heading paths below |
| `create <name>` | Starts a contribution, with `merge: patch` unless `--merge` says otherwise |
| `customize <name>` | Picks what a name builds on, or writes a body generated from your request; see [Customizing a reference](#customizing-a-reference) |
| `delete <name>` | Deletes a contribution, and reports what answers the name afterwards |
| `implementations <id>` | The implementations of an [interface](/cyber-agentkit/concepts/reference-interfaces/) a consumer can load |
| `check [name]...` | Checks references against their [interface](/cyber-agentkit/concepts/reference-interfaces/) and warns of hidden files |

`create`, `customize`, and `delete` act on the repo tier by default (`.agents/references/` at the
root) or the user tier with `--scope user` (`~/.agents/references/`). `--in <folder>` acts on that
folder's project section instead. `create` and `delete` also take `--plugin <plugin folder>` or
`--default <skill folder>`, for a plugin's or a skill's source in the repository. They never write to
a managed folder or an installed copy of a plugin or skill. `--dry-run` prints what a write would do.
A write that a contribution above would hide still happens, with a `reference-hidden` warning. The
read-only subcommands change no file.

## The reference skill

The package is also an agent plugin, `cyber-agentkit`, that ships a `reference` skill. Type
`/reference` to run it. Installed as a Claude Code plugin, it is `/cyber-agentkit:reference`. The
[skill page](/cyber-agentkit/packages/cyber-agentkit/skills/reference/) lists every kind of request it handles.

The skill shows each file and its path, and writes or deletes it only on your approval. It never
edits a contribution a plugin ships; it writes one above it instead. Load runs only the skill's
bundled `scripts/reference.mjs`, never a package runner.

A skill loads references by naming them in one line:

```text
Load `agent-readiness-weights` and `release-checklist` with the `reference` skill of `cyber-agentkit`.
```

## References that are not Markdown

A reference can also be a data file: `<name>.json`, `<name>.yaml`, `<name>.yml`, `<name>.toml`, or
`<name>.txt`, in any tier's references folder, and `<name>.default.<extension>` as a skill's default. The
name stays bare, so `checks.json` is asked for as `checks`.

A data file is not composed. Sections, `patch`, and `combine` mean nothing inside JSON, so the highest tier
that holds the name answers with its file as written, and everything below it is shadowed. A Markdown
contribution above a data file is ignored with a `format-mismatch` warning, except `merge: remove`, which
turns the name off. When one folder holds several files for a name, the first of `.md`, `README.md`,
`.json`, `.yaml`, `.yml`, `.toml`, `.txt` answers and the others are ignored with a warning. The content is
returned as text and is not parsed.

To change which file a skill uses, override by name: a skill ships `permissions.default.json`, another plugin ships
`permissions.json`, and `reference customize permissions --extends <plugin>` (a Markdown selection with only `extends`) or a
repo or user `permissions.json` decides which one answers. There is no separate mechanism, and it works through
the command and the library alike.

`load` marks a data answer with its `format`, and `list` does too. `create` writes Markdown only, so write a
data file by hand. Its description, tags, aliases, picks, and generated record live in `<name>.meta.md`
beside it, because JSON has no frontmatter. A metadata file with `extends` alone is a selection.
`delete` removes the metadata file with the data file.

## Assets by name

A skill that ships a data file in its `assets/` folder can let others override which file it loads. The `asset`
skill does this, not `reference`: `asset load`, `asset names`, `asset where`, and `asset select`, or `loadAsset` in the library, read the same tiers over
`assets/` folders. They read `.agents/assets/` in the project and under the
home directory, a plugin's `assets/`, a harness's managed `assets/`, and the skill's own `assets/<name>.<ext>` as
the default, with no `.default` marker.

```sh
npx -y cyber-agentkit asset load permissions --default <skill folder>
npx -y cyber-agentkit asset select permissions <plugin>
```

The highest tier holding the name answers with the file as written. Nothing merges or extends, Markdown included,
so choosing is not an `extends`. When two plugins hold a name the answer is ambiguous: `asset select` writes a
one-line `<name>.select` file naming the plugin, or `default` for the skill's own file, in the project or user
`assets/` folder. A file of the same name in a tier, or a request for `<plugin>/<name>`, also answers. The `reference`
commands never read `assets/`.

To start an override, `asset create <name> --copy <plugin|default|project|user> --scope project|user` copies that
source's file into the tier folder to edit. It never copies from the managed tier: that is administrator policy, a
copy in a shared repository would leak it, and the managed file would still win over the copy. Read it with
`asset load` instead. `asset list`, `show`, `create`, `update`, and `delete` act on one skill's files by
path, with no tiers.

## Where contributions are read from

The root is the nearest folder at or above the working folder that holds `.git`, a folder or a file,
so a git worktree counts. With no `.git`, the working folder is the root. `--root` sets it; a root that
does not exist fails with `root-missing`.

A name may have a contribution in several layers. The tiers, listed from highest to lowest:

| Tier | Folders |
| --- | --- |
| managed | `references/` beside the managed-policy files of the detected harness; read only when detection names exactly one harness |
| repo | `.agents/references/` at the root |
| user | `~/.agents/references/` |
| plugin | The calling plugin's `references/`, each plugin the harness has enabled, then each dependency in the root's `package.json` that has a plugin manifest |
| default | `<skill folder>/references/<name>.default.md` of the skill loading the name, given by `--default <skill folder>` |

Within a folder, only `<name>.md` and `<name>/README.md` answer a name, in that order. A
`<name>.default.md` in a tier folder is ignored with a warning: a default goes in a skill's
`references/` folder.

A plugin is named by the `name` in its plugin manifest, never by its npm package name. A plugin
layer is read only for a plugin the harness has enabled, or a package the root declares that has
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
3. The repo contribution.
4. The managed contribution.

A higher contribution wins where they conflict.

### Project sections

A `.agents/references/<name>.md` in a folder below the root, one that git does not ignore, is a
project section for that folder. It is not a tier and never changes the main document. `load`
delivers each one after the main document, in path order. In text it is wrapped as
`<project folder="packages/web">...</project>`; in structured output it is a record in
`projectSections`, which makes the entry a record. The managed contribution applies over each
section. `search` and `list --trace` cover them too, and a trace row for one has
`kind: project-section` and its `folder`.

Write one with `--in <folder>` on `create`, `customize`, `delete`, or `where`. The folder must be
below the root, exist, and not be ignored by git.

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

- The highest `extends` written in the managed, repo, or user tier builds the stack. A plugin or
  the default it leaves out is not used.
- Each step brings its own `extends` beneath it. A step can carry its own keys:
  `- house-style: {merge: combine, extends: []}`, or `house-style: combine` for just the operation.
- With no written `extends`, the plugins' own `extends` order them, and the default is lowest.
  Plugins that nothing orders make the name `ambiguous`, with each `<plugin>/<name>` and the default
  as options.
- A step not installed, or not holding the name, is skipped with a warning. When every step is
  missing, the `extends` counts as not written.
- When a plugin answers over the loading skill's default and no `extends` names either, the name
  still answers, with a warning that names `reference customize`.

A contribution with `extends` and no body is a selection: it picks the stack and changes nothing
else. `reference customize <name> --extends <step>...` writes one:

```sh
npx -y cyber-agentkit reference customize project-tracker.capabilities.github --extends repobuddy house-style
```

A step is a plugin name, `<plugin>:<merge>` such as `house-style:combine`, or `default`. `--extends none`
removes the picks. `--extends-file <file>` reads the whole list from YAML when a step needs more keys.
A step can also carry `sections`, a list of top-level headings that limits it to those sections, each
with its own operation. A section the step lacks is skipped with a `section-not-held` warning.

A qualified name, `<plugin>/<name>`, builds that plugin's own stack. A written `extends` is not used
for it, and managed, repo, and user contributions still apply over it.

### Aliases

A plugin's or a skill default's contribution lists its older names in frontmatter `aliases`. A load of
an older name resolves the new one with a `reference-renamed` warning. A file in a tier still filed
under an older name applies as the new name.

## Customizing a reference

`reference customize` is for a change that is easier to ask for than to write. It runs no model. The
agent that calls it does the generating:

1. `customize <name> --base` prints what the generator reads, and writes nothing: the name resolved
   with your picks, leaving out the target file, the managed text, the tier above, and personal text.
   With `--implements`, the interface's stub comes first.
2. The agent writes a body from your request.
3. `customize <name> --request <file> --body <file>` writes the body as given. It records the picks
   as `extends`, the `sources` the body was built from, and your `request`. `--merge` says how it
   applies, `patch` by default; `--implements <interface>` writes a whole implementation with
   `merge: replace`. `--scope repo|user` or `--in <folder>` picks the target.

A name that is not Markdown records the same in `<name>.meta.md`. The
[skill](/cyber-agentkit/packages/cyber-agentkit/skills/reference/) asks for your approval before it
writes.

### Staleness

A generated document names the plugins it was built from and their versions. When a source plugin's
version has changed, `load` warns `reference-stale`. The document still loads. Ask the skill to
customize it again to regenerate it from the new source and your recorded request.

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

- `load --format json` gives each found name's content as a string. A name not found, one with
  warnings, or one with project sections is a record.
- `--metadata` makes every entry a record, with its `status` and `metadata`: the composed
  frontmatter, the higher contribution winning each key, without `merge` and `extends`.
- `--trace` adds the trace. It shows the stack and what built it, the contributions behind each
  section, and every layer checked with its frontmatter as written, its operation, and its outcome.
  The trace also names the detected harnesses.

Every warning is `{code, message}`; the code is stable and the wording is not. In text, a warning
prints on stderr as `warning: <code>: <message>`. Several names print as `<reference name="...">`
blocks, in the order asked.

### Exit codes and errors

Errors follow the axi contract. A command that cannot complete prints one error value on stdout, with
`error`, a stable `code`, any detail fields, and `help`, and writes nothing to stderr.

| Exit | Means |
| --- | --- |
| 0 | The command answered. This includes `load` for a name not found (its `status` and `code` are in the answer), a `check` with failures, `where` on an invalid name, and an empty `list`, `search`, or `implementations` |
| 1 | The command could not complete, such as a refused write or a missing root |
| 2 | A usage error |

A warning never changes the exit code. A library function throws `ReferenceError` with the same
`code`; the table is exported as `referenceCodes`.

## Frontmatter

Frontmatter is read as YAML. The resolver reads `merge`, `extends`, and `aliases`; `list` and
`search` show `description`, and `search` also matches `tags`. `check` and `implementations` read
`interface` and `implements`. A document `customize` generated also carries `sources` and `request`.
Frontmatter that is not a YAML mapping is ignored with a warning.
