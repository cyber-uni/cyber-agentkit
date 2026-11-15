# 0006 — Reference files are named by one rule, with `.default` for a skill's copy

**Status:** accepted (2026-11-15). Settles question Q22 from the Council: a skill's bundled copy of an interface
document is named `references/<id>.interface.default.md` (O1). The design lives in the [reference spec](../../reference/README.md)
(K8, K13, K31, K32, K38, R14) and the [skill use case](../../reference/skill/README.md) (UC25).

## Decision

Every reference file's name is its reference name plus a suffix that says its form. A skill's copy of a name is the
same name with `.default` inserted before the extension, the default rule (K13) applied to whatever the name is. No
form has an exception.

| Form | Where | File name |
| --- | --- | --- |
| Interface document (K8) | plugin, repo, user, project folder | `<id>.interface.md` |
| Implementation of a `one` interface | plugin, repo, user, project folder | `<id>.md`, declaring `implements: <id>@<version>` |
| Implementation of a `many` interface | plugin, repo, user, project folder | `<id>.<key>.md`, declaring `implements: <id>@<version>`; the key is the plugin's choice |
| Skill default of a name | the skill's `references/` folder | `<name>.default.md` |
| Skill default of an interface document | the skill's `references/` folder | `<id>.interface.default.md` |
| Data-format default (json, yaml, yml, toml, txt) | the skill's `references/` folder | `<name>.default.<ext>` |
| Metadata file of a non-Markdown contribution (K31) | beside the contribution | `<name>.meta.md`; a default's is `<name>.default.meta.md` |
| Aliases (K32) | in the document's frontmatter | `aliases:`, no file |
| Rename table (K38) | a plugin's `references/` folder | `_renames.yaml` |

A file under any other name is not read as a contribution. A skill's `<name>.md` is not read as a default, so a copy
written under that name reads as `misnamed` in `defaults --check` and fails it.

## Why O1 over the alternatives

- **`<id>.interface.default.md` (chosen).** It is the default rule with no special case, so a reader who knows
  `<name>.default.md` knows this form too. It is also the name a skill's `reference defaults` check can derive from
  the interface's own name, `<id>.interface`.
- **Keep `<id>.interface.md` in the skill.** A skill's `.md` file is a contribution of nothing, since defaults are read
  only from `.default` names. The resolver would ignore the copy, and the skill would silently fall back to whatever the
  installed plugin brings, which is the failure bundling exists to prevent. Repobuddy writes this form today; it reads
  as `misnamed`.
- **Do not bundle interface documents.** The skill would load an interface its installed plugin may not carry, and
  `defaults --check` would have nothing to hold it to. Interfaces are the contracts other skills depend on, so the copy
  is most needed for them.

## Consequences

- A skill's interface default answers only when no plugin and no other tier holds the interface (R14). Under the old
  stack order, the skill's default was the lowest contribution and answered ahead of the plugin's copy. That is fixed
  with this decision, since a bundled copy must never override the plugin the user installed.
- `reference defaults <skill>` bundles interfaces under this name, and `--check` reports the `.interface.md` form as
  `misnamed` (UC25.5).
- The reference skill's Create, Migrate, and Customize modes name files by this table. Anything written under another
  name needs to be migrated, which `migrate` already covers for the legacy forms of K37.

## Rejected

- A separate file per form with its own suffix (`.iface.md`, `.impl.md`). It adds a second naming rule to remember
  for no gain, since the stack, the default rule, and the metadata suffix already cover every case.
