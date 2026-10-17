---
title: Reference interfaces
description: How a reference declares an interface, how other references implement it, how a skill loads the implementations, and how one plugin's reference overrides another plugin's.
---

An interface is a named contract. A skill consumes it, and a [reference](/agent-harness/concepts/reference-documents/)
in any tier implements it. The resolver lists the implementations of an interface, checks that
each has the shape the interface requires, and lets one plugin's reference override another
plugin's.

| Term | Means |
| --- | --- |
| interface | An id, a cardinality, a version, and the `##` sections an implementation has |
| interface document | The reference that declares an interface, named `<id>.interface` |
| implementation | A reference that declares `implements: <id>@<version>` |
| consumer | A skill that reads the implementations of an interface |

## Declaring an interface

The plugin that owns an interface ships its interface document, named `<id>.interface`. Its
frontmatter holds the contract. Its body holds the prose agents read.

```md
---
description: What a scaffold.recipe.<name> reference must contain.
interface:
  cardinality: many
  version: 1
  versions: [1]
  tiers: [managed, project, user, plugin]
  sections:
    - Recipe: required
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
| `tiers` | Optional. The tiers that may implement it, such as `[project]` |
| `sections` | The `##` sections, in order. A section is optional unless marked `required` |

Heading text is API. Adding a section or an optional field keeps the version. Renaming or removing
a section, or making one required, raises it.

An interface document is not overridable. A higher-tier copy of `<id>.interface` is ignored with a
warning, and the lowest copy answers. To change a contract, define a new interface id.

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
- `implements` may be a list, when one document implements two interfaces.
- A section whose first line is `**Unsupported.**` is a declared gap. An absent optional section
  also counts as unsupported. A `required` section can be neither.

Start one from the interface's sections:

```sh
npx -y @cyberuni/agent-harness reference create scaffold.recipe.typescript-lib --implements scaffold.recipe
```

It writes each section as a `##` heading, stubs each optional one `**Unsupported.**`, and sets
`implements`. It refuses a name or a tier the interface does not allow.

## Loading the implementations

A consumer names the interface in its References line:

```text
Load the implementations of the `scaffold.recipe` interface with the `reference` skill in the `cyber-agent-harness` plugin.
```

The skill runs:

```sh
reference implementations scaffold.recipe --format json
```

It returns each compatible implementation with its pin, tier, `description`, and the sections it
marks unsupported. It also returns each implementation it left out, with the reasons, such as
`unknown version 2`, `missing required section Recipe`, or
`ambiguous between a/scaffold.recipe.x and b/scaffold.recipe.x`.

The pin is what the consumer loads: `<plugin>/<name>` when a plugin's copy is the base, or the bare
name for a project or user copy. `--accept 1,2` replaces the interface's `versions`, for a consumer
shipped apart from the interface's owner.

A consumer that reads one known implementation, such as a `one` slot, loads it by name with `show`.
`show` warns when the document it resolves fails its interface check.

```ts
import { homedir } from 'node:os'
import { referenceImplementations, referenceLayers } from '@cyberuni/agent-harness'

const layers = await referenceLayers({ root: process.cwd(), home: homedir(), platform: process.platform })
const { implementations, excluded } = referenceImplementations('scaffold.recipe', layers)
```

## Checking

`reference check [name]...` checks each reference after every override is merged, since
`<!-- merge: remove -->` can drop a section. With no names, it checks every interface document and
every reference that declares `implements`. It exits 1 on any failure, so a plugin's CI can run it.

| Check | Fails when |
| --- | --- |
| interface found | `implements` names no `<id>.interface`, or is not `<id>@<version>` |
| version | the declared version is not in the interface's `versions` |
| name | the name is not `<id>` or `<id>.<key>` |
| tier | a used layer's tier is not in `tiers` |
| required | a `required` section is absent or `**Unsupported.**` |
| known | a `##` heading is not one of the interface's sections |
| order | the sections are out of the declared order, or one appears twice |
| interface | an interface document's frontmatter is malformed |

`implementations` applies the same checks to decide what to leave out. The library exports the
check as `checkReferences`.

## Overriding another plugin

Plugins are alternatives: two plugins holding one name make it ambiguous. A plugin's copy can
declare which plugins' copies it sits above:

```md
---
implements: project-tracker.capabilities@1
overrides: [repobuddy]
merge: merge-sections
---

## Create

The house way to file an issue.
```

- When every plugin holding the name but one is named in that one's `overrides`, the name is not
  ambiguous. The overriding copy sits above the others, and its `merge` mode applies as it does for
  a project override.
- Two plugins that override each other stay ambiguous. So does a third holder that no one names.
- A pin to the overridden plugin, such as `repobuddy/project-tracker.capabilities.github`, still
  applies the copies that name it.
- `overrides` matches any name of a plugin: its package name or its `plugin.json` name.
- `show --trace` reports the overriding copy as `used (overrides repobuddy)`.

`overrides` applies only to a plugin's copy. The project, user, and managed tiers already sit above
the plugin tier.
