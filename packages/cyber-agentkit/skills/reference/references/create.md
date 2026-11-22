# Create a reference

Create writes a new file from text the author gives, an interface's stub, or a capability reference's stub. To change what an existing reference says in the customizer's own words, use Customize mode instead.

## 1. Check that it should be a reference

- If the agent must decide from the task that it needs this, it is a **skill**, not a reference. Say so and stop.
- If an `AGENTS.md` line, a skill, or a person will name it, it is a reference. Continue.

## 2. Choose where it lives

| Who it is for | Where | Flag |
| --- | --- | --- |
| everyone working in this repository | `.agents/references/<name>.md` at the root | (none) |
| work in one folder of the repository | `<folder>/.agents/references/<name>.md` | `--in <folder>` |
| the user, in every repository | `~/.agents/references/<name>.md` | `--scope user` |
| every user of a plugin | `references/<name>.md` in the plugin's source folder | `--plugin <plugin folder>` |
| a skill, as its default | `references/<name>.default.md` in the skill's source folder | `--default <skill folder>` |

`--plugin` and `--default` write only into a source folder in this repository, never into an installed copy. A folder's project section states only what differs there, and takes no `--merge`.

## 3. Name it

- Use lowercase words joined by `-`. A name is a file name, never a path, and never ends `.default`.
- **A plugin prefixes every name it ships** with its own name and a dot: `cyber-asana.work-hierarchy`, not `work-hierarchy`. A repository's or user's own reference needs no prefix. A skill's default takes the name its skill loads.
- **A capability reference is named `<system>.capabilities`**, with no plugin prefix: `asana.capabilities`. It says what one system the skills operate through commands or an API can do, such as a tracker or a tool; never a harness. `<system>` is one word or hyphenated words, with no dot.
- **An implementation of an interface takes the interface's id as its namespace**: `<id>` when the interface's cardinality is `one`, `<id>.<key>` when it is `many`. Read the interface with `load <id>.interface`.
- **A blueprint is named `<id>.<system>.<solution>`**, where `<id>` ends `.blueprints`: `project-tracker.blueprints.asana.custom-field`. `<system>` names its capability reference, `<system>.capabilities`; `<solution>` names this way of using the system. A blueprint interface's cardinality is always `many`.
- Run `load <name>`. If the name already resolves and the author wants a new document, pick another name. To change the existing one, go to Customize mode.
- When a plugin or a skill renames a name it ships, list the old name in the new file's `aliases` frontmatter, so load lines and customizations written for the old name still reach it.
- When a plain reference becomes the interface document of a `many` interface, list its old name in the interface document's `aliases` the same way. For a `one` interface, add the rename to `<plugin folder>/references/_renames.yaml` instead.

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
- If the author's text starts with a `#` title, drop the title and make the sections under it top-level `##` sections.
- Write instructions an agent follows. Leave the rationale out.

Run `create`; never write the file by hand:

1. Run `create <name> --dry-run`, with the flag from step 2. Add `--template <path>` with the file holding the author's text; without it, the command writes its own template. Add `--merge <operation>` when it should not patch: `combine` to add after what is below, `replace` to stand alone, `remove` to turn the name off.
2. When the request gave the text, the request is the approval: run the same command without `--dry-run`, then show the author the path, the content, and any `hint:` or `warning:` line. A warning that a contribution above hides the file still writes it.
3. Otherwise, show the author the path, the content it printed, and any `hint:` or `warning:` line, and on approval run the same command without `--dry-run`.

If `create` refuses, report its reason and write nothing. An existing file with a body means Customize mode, or Update mode for a file the user wrote by hand.

A plugin's file or a skill's default that changes how another plugin's reference reads, such as a house style, lists `extends: [<other plugin>]` in its frontmatter and holds only the sections it changes. It may also build on another reference of that plugin as `<plugin>/<reference>`, but only a repo, user, or managed file may choose another reference; a plugin's own `extends` naming one is skipped with a warning. `create` records in `sources` the version of each plugin it extends, so `check` warns the author when that plugin moves on. Never give such a file `merge: replace`; `create` refuses it.

## 5. Stub an interface, a capability reference, or a blueprint

Run `create <name> --implements <id> --dry-run` instead of passing a template. It writes each section of the interface as a `##` heading, stubbed `**Unsupported.**` with what the section holds, and sets `implements: <id>@<version>` and `merge: replace`. With `--in <folder>`, it writes a project section with neither. Show it, write it on approval, then replace each stub with the section, or keep a support level: `**Unsupported.**`, or `**Partial.**` for a section only partly honored, followed by one sentence on what is missing or why. A required section cannot stay unsupported; one marked partial counts as present. Run `check <name>`; it must pass.

For a capability reference, run `create <system>.capabilities --dry-run` with no template. It stubs System, Detect, and Verified, in that order, each saying what it holds; they must stay the first three sections. Add one `##` section per feature after them. A feature may open with `**Partial.**` or `**Unsupported.**` and one sentence, and may carry a `Since:` or `Until:` line naming the version or tier it arrived in or left. Never add `implements`. Suggest the author keep it thin: link the system's docs for general behavior, and hold what a skill decides on, how this setup differs from the docs, and what running the commands found. `check` enforces only the shape, never what a section says. Show it, write it on approval, and run `check <name>`; it must pass.

For a blueprint, stub it with `--implements <id>` as for any implementation. It describes one whole way to fulfill the interface on its system; a choice the author knows is independent of the rest may be its own reference, loaded by name. Its capability reference must resolve: run `load <system>.capabilities` first, and create it when it is missing. When another plugin ships it, the blueprint's plugin lists that plugin as a dependency. In each section that relies on a feature of the system, add a `Needs:` line naming the capability reference's feature sections, comma-separated, as their headings read: `Needs: Epics, Issue links`. Keep facts about the system in the capability reference, not the blueprint. `check` fails a blueprint whose capability reference is not found, or whose `Needs:` line names a feature that reference has no section for.

## 6. Show the result

1. Run `load <name> --trace`, adding `--default <skill folder>` for a skill's default. The new file must be `used`, or the trace names what hides it.
2. Show the author where each section came from: for each row of the trace's `sections`, the heading and the contributions that built it.
3. Offer the full document. When the author accepts, run `load <name>` and show what it prints.

For a plugin reference, run the command where the plugin is installed; otherwise, say that the plugin tier was not checked.

## 7. Connect it to a caller

Nothing loads a reference by itself. Tell the author where to name it:

- For a repository, add a line to `AGENTS.md`, or to the skill that needs it, such as: "Read the `testing` reference before writing tests."
- For a plugin or a skill's default, add the load line to each skill that needs it, as Wire a skill says.
