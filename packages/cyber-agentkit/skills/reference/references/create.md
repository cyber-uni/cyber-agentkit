# Create a reference

## 1. Check that it should be a reference

Decide who starts the read:

- If the agent must decide from the task that it needs this, it is a **skill**, not a reference. Say so and stop.
- If an `AGENTS.md` line, a skill, or a person will name it, it is a reference. Continue.

## 2. Choose where it lives

| Who it is for | Where | Flag |
| --- | --- | --- |
| this repository | `.agents/references/<name>.md` at the root, or in a package's folder for that package alone | (none) |
| the user, in every repository | `~/.agents/references/<name>.md` | `--scope user` |
| every user of a plugin | `references/<name>.md` in the plugin's source folder, next to its `skills/` | `--plugin <plugin folder>` |
| a skill, as its default | `references/<name>.default.md` in the skill's source folder | `--default <skill folder>` |

`--plugin` and `--default` write only into a source folder in this repository, never into an installed copy. To change a reference that already exists, use Update instead.

## 3. Name it

- Use lowercase words joined by `-`. A name is a file name, never a path, and never ends `.default`.
- **A plugin prefixes every name it ships** with its own name and a dot: `cyber-asana.work-hierarchy`, not `work-hierarchy`. Without the prefix, every plugin that ships `work-hierarchy` contributes to one name, and the name is ambiguous until someone selects one.
- A repository's or user's own reference needs no prefix. A skill's default takes the name its skill loads.
- **An implementation of an interface takes the interface's id as its namespace**, not the plugin's: `<id>` when the interface's cardinality is `one`, `<id>.<key>` when it is `many`, such as `scaffold.recipe.typescript-lib`. Read the interface with `show <id>.interface`.
- Run `show <name>`. If the name already resolves and the user wants a new document, pick another name; to change the existing one, switch to Update.
- Do not rename a reference that a plugin has already shipped. Its callers load it by the old name. Rename one only in a release that also updates every caller.

## 4. Write it

A reference is top-level `##` sections, with no single `#` title holding them, and a `description` in its frontmatter:

```md
---
description: One line that says what the reference covers.
tags: [testing, fixtures]
---

## Fixtures

Instructions only.
```

- `description` and `tags` are what `search` matches. Always write a `description`.
- Other frontmatter keys are allowed. `show --metadata` returns them under `metadata`, composed key by key across the contributions used.
- If the user's text starts with a `#` title, drop the title and make the sections under it top-level `##` sections. `create` refuses a template whose top level is one heading holding the others.
- Write instructions an agent follows. Leave the rationale out.

Run `create`; never write the file by hand:

1. Run `create <name> --dry-run`, with the flag from step 2. Add `--template <path>` when a calling skill or the user supplies the text; without it, the command writes its own template. Add `--merge <operation>` when it should not patch: `combine` to add after what is below, `replace` to stand alone, `remove` to turn the name off.
2. Show the user the path and the content it printed, and any `hint:` line.
3. On approval, run the same command without `--dry-run`. Then run `show <name>`; add `--trace` to see the new file `used`.

If `create` refuses, report its reason and write nothing. An existing file with a body means Update. A file holding only a selection gets the body added, and keeps its `extends`.

To implement an interface, run `create <name> --implements <id> --dry-run` instead of passing a template. It writes the interface's sections as `##` headings, stubs each one `**Unsupported.**`, and sets `implements: <id>@<version>` and `merge: replace`. Replace each stub with the section, or keep `**Unsupported.**` followed by one sentence on why. Then run `check <name>`; it must pass.

A plugin that changes how another plugin's reference reads, such as a house style, ships the same name with `extends: [<other plugin>]` in its frontmatter, holding only the sections it changes; it patches the other plugin's text. A plugin that builds on the loading skill's default lists `default` in `extends`.

## 5. Connect it to a caller

Nothing loads a reference by itself. Tell the user where to name it:

- For a repository, add a line to `AGENTS.md`, or to the skill that needs it, such as: "Read the `testing` reference before writing tests."
- For a plugin or a skill's default, add the load line to each skill that needs the reference, as Wire a skill says.

## 6. Verify

Run `show <name> --trace`. The new file must be `used`. For a skill's default, add `--default <skill folder>`. For an implementation, `check <name>` must also pass. For a plugin reference, run the command where the plugin is installed; otherwise, report that the plugin tier was not checked.
