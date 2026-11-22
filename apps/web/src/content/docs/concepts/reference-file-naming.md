---
title: Reference file naming
description: "The one naming rule for every reference file: the suffix says the form, a skill's copy adds .default, and an interface's document is <id>.interface.md."
---

Every reference file is named for the reference it holds, plus a suffix that says what kind of file it is. The
rule has no exceptions, so a file's name tells you how the command reads it.

## The forms

| Form | Where it lives | File name |
| --- | --- | --- |
| Interface document | a plugin, the repository, the user, or a project folder | `<id>.interface.md` |
| Implementation of a `one` interface | the same places | `<id>.md`, with `implements: <id>@<version>` |
| Implementation of a `many` interface | the same places | `<id>.<key>.md`, with `implements: <id>@<version>` |
| Skill default | the skill's `references/` folder | `<name>.default.md` |
| Skill default of an interface document | the skill's `references/` folder | `<id>.interface.default.md` |
| Data-format default (json, yaml, yml, toml, txt) | the skill's `references/` folder | `<name>.default.<ext>` |
| Metadata file of a non-Markdown reference | beside the reference | `<name>.meta.md`, or `<name>.default.meta.md` for a default |
| Rename table | a plugin's `references/` folder | `_renames.yaml` |
| Capability reference | the same places as an implementation | `<system>.capabilities.md` |
| Blueprint (planned) | the same places as an implementation | `<id>.<system>.<solution>.md`, where `<id>` ends in `.blueprints` |

[Capability references and blueprints](/cyber-agentkit/concepts/capability-references/) explains both forms;
blueprints are planned.

Aliases have no file. A document lists its older names in its `aliases` frontmatter.

## The default rule

A skill's copy of a reference is the same name with `.default` inserted before the extension. That covers every
form: a name's default is `<name>.default.md`, and an interface's default is `<id>.interface.default.md`, because
the interface's name is `<id>.interface`.

A skill's file named `<name>.md`, or `<id>.interface.md`, is not read as a default. The command reports it as
`misnamed` and `defaults --check` fails until it is renamed.

## Why the interface copy has this name

Keeping `<id>.interface.md` in the skill would look like a copy, but the resolver never reads it, so the skill would
quietly fall back to whatever the installed plugin brings. Leaving interfaces out of the bundle has the same effect.
The `.default` form is the one name the resolver reads, so the copy works, and `check` can hold it to the plugin's
document.

A skill's interface default answers only when no plugin and no other tier holds the interface. The plugin's
document, or a repository or user copy, always wins over the skill's copy.

See [reference documents](/cyber-agentkit/concepts/reference-documents/) for how the tiers compose, and
[reference interfaces](/cyber-agentkit/concepts/reference-interfaces/) for what an interface document says.
