---
title: Reference interfaces
description: How a reference declares an interface, how other references implement it, how a skill loads the implementations, and how one plugin's implementation builds on another's.
---

An interface is a named contract. A skill consumes it, and a [reference](/cyber-agentkit/concepts/reference-documents/)
in any tier implements it. The resolver lists the implementations of an interface, and checks that
each one has the shape the interface describes.

| Term | Means |
| --- | --- |
| interface | An id, a cardinality, a version, and the top-level sections an implementation has |
| interface document | The reference that declares an interface, named `<id>.interface` |
| implementation | A reference that declares `implements: <id>@<version>` |
| consumer | A skill that reads the implementations of an interface |

## Declaring an interface

The plugin that owns an interface ships its interface document, named `<id>.interface`. Its
frontmatter holds the contract. Its body holds the prose implementers read.

```md
---
description: What a scaffold.recipe.<name> reference must contain.
interface:
  cardinality: many
  version: 1
  versions: [1]
  sections:
    - Recipe
    - Inputs
    - Files
    - Config
    - Verify
    - Post
---

## Order of work

Recipe, Inputs, Files, Config, Verify, Post.
```

| Key | Holds |
| --- | --- |
| `cardinality` | `one`: the implementation is named `<id>`. `many`: each is named `<id>.<key>` |
| `version` | A positive integer |
| `versions` | The versions the owner's consumers accept. Defaults to `[version]` |
| `sections` | The implementation's top-level sections, in order, each listed once |

A missing or malformed key fails the `interface` check, naming each problem. Any other key is
ignored. Every section is optional, and a `required` mark on a listed section is ignored. Heading
text is API: renaming or removing a section raises the version.

An interface document is never composed. A higher contribution of `<id>.interface` is ignored with a
warning, and so are `extends` and `merge` on it; the lowest contribution answers. Two plugins
holding one make it `ambiguous`. To change a contract, define a new interface id.

## Implementing an interface

```md
---
description: What the GitHub tracker can do for issue, epic, and initiative skills.
implements: project-tracker.capabilities@1
---

## Tracker

- Name: `github`

## Retype

**Unsupported.** Retyping is done by hand.
```

- The name is `<id>` for cardinality `one`, or `<id>.<key>` for `many`. The interface id is the
  namespace, so an implementation does not take its plugin's prefix.
- `implements` names one interface.
- A listed section whose first line is `**Unsupported.**`, or that is left out, is listed as
  unsupported. A section the interface does not list may sit anywhere.

Start one from the interface's sections:

```sh
npx -y cyber-agentkit reference create scaffold.recipe.typescript-lib --implements scaffold.recipe
```

It writes each section as a `##` heading stubbed `**Unsupported.**`, sets `implements`, and writes
`merge: replace`. It refuses a name the interface does not allow.

## Loading the implementations

A consumer names the interface in one line:

```text
Load the implementations of the `scaffold.recipe` interface with the `reference` skill of `cyber-agentkit`.
```

The skill runs:

```sh
reference implementations scaffold.recipe --format json
```

It returns each implementation that passes `check` for the interface, with its `pin`,
`description`, and the sections it does not support. `--trace` adds each one's name, tier, and
version, the interface's cardinality and accepted versions, and each implementation it left out
with the reasons, such as `version: unknown version 2`.

The pin is what the consumer loads: the name as it resolved, or `<plugin>/<name>` for each plugin
when no `extends` orders the plugins holding it. A skill's default is never listed: it has no
qualified name to pin. `--accept 1,2` replaces the interface's `versions`, for a consumer shipped
apart from the interface's owner.

A consumer that reads one known implementation, such as a `one` slot, loads it by name with `show`.
`show` warns when the document it composes fails its interface check.

```ts
import { homedir } from 'node:os'
import { referenceImplementations, referenceLayers } from 'cyber-agentkit'

const layers = await referenceLayers({ root: process.cwd(), home: homedir(), platform: process.platform })
const { implementations, excluded } = referenceImplementations('scaffold.recipe', layers)
```

## Checking

`reference check [name]...` checks each reference as `show` composes it, since a contribution above
can drop or change a section. With no names, it checks every interface document and implementation
found. It also checks a name several plugins hold as each `<plugin>/<name>`, and each skill's
default as its skill loads it. It exits 1 on any failure, so a plugin's CI can run it. Its answer
gives each reference that fails, with its failures, and the count that pass.

| Check | Fails when |
| --- | --- |
| interface found | `implements` is not one `<id>@<version>`, or names no found, valid `<id>.interface` |
| version | the declared version is not in the interface's `versions` |
| name | the name is not `<id>` or `<id>.<key>` |
| order | the listed sections are out of order, or one appears twice |
| interface | an interface document's `interface` block is malformed |
| compose | composing the document raised a warning |

A name not found fails with its status code, such as `reference-missing`. `implementations` applies
the same checks to decide what to leave out. The library exports the check as `checkReferences`.

## Building on another plugin's implementation

A plugin can change how another plugin's implementation reads without forking it, such as a house
style. It ships the same name, lists the other plugin in `extends`, and holds only the sections it
changes:

```md
---
implements: project-tracker.capabilities@1
extends: [repobuddy]
---

## Create

The house way to file an issue.
```

With no `extends` written in the managed, project, or user tier, the plugins' own `extends` order
them: `repobuddy` sits below, and this contribution patches it. Plugins that nothing orders make the
name `ambiguous`. A project settles that with `reference select <name> <plugin>...`. A qualified name
such as `repobuddy/project-tracker.capabilities.github` builds only `repobuddy`'s own stack.
