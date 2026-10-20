---
spec-type: behavioral
---

# reference/write — contributions are written, selected, and removed without editing an installed plugin

Part of [reference](../README.md). Its What, key terms, actors, adapters, names, and output contract apply here;
IDs are shared across the parent and its children.

## Use Cases

### UC5 — Customize a plugin's instructions (A5.1)

- **Trigger:** a customizer wants to change what a skill reads for a name: replace, patch, combine with, or remove what
  is below; or an author writes a contribution or a default into their plugin's or skill's source.
- **Entry points:** Skill: the `reference` skill's Create and Update modes; Update edits the file, then checks the
  trace. Code: `reference create <name> [--scope user | --plugin <plugin folder> | --default <skill folder>] [--merge
  <operation>] [--template <file> | --implements <id>] [--dry-run]`.
- **Inputs:** a bare name; where it is written (the project tier by default, the user tier, or a plugin's or skill's
  source folder); the operation (default `patch`); a template or an interface; the root.
- **Outcome:** `create` writes `<name>.md` in that tier's folder with `merge: <operation>`, and reports the path with
  a hint that `show <name>` gives the composed document; with `--trace`, also the resulting trace, in which the new
  file applies over everything below it (K17). The skill shows the user where each section came from and offers the
  full document.
- **Extensions:**
  - UC5.1 The file exists with a body: error, and nothing is written. `create` never overwrites; Update edits it.
  - UC5.2 The file holds only a selection: `create` adds the body and `merge`, and keeps its `extends`.
  - UC5.3 A qualified name: error naming the bare name to use.
  - UC5.4 A `replace` or `remove` above would hide the new file: error naming that contribution.
  - UC5.5 `--implements <id>`: the interface's sections are written with `merge: replace`.
  - UC5.6 `--merge remove`: no body is written. With `--template`: error.
  - UC5.7 Both `--template` and `--implements`, an unreadable template, a template whose frontmatter is not a mapping,
    or an unknown interface: error.
  - UC5.8 A template whose top level is a single heading holding all the others (a title, so `patch` would add the whole
    document instead of patching its sections): error, and nothing is written. A template with no `description`:
    written, with a hint that `list` and `search` will show it blank.
  - UC5.9 `--dry-run`: the path and the content are printed, and nothing is written.
  - UC5.10 `--plugin <plugin folder>`: writes `<plugin folder>/references/<name>.md`, with `merge` only when `--merge`
    is given. `--default <skill folder>`: writes `<skill folder>/references/<name>.default.md`, with no `merge`. The
    hide check (UC5.4) and the trace apply only when the folder is a layer the stack reads.
  - UC5.11 The folder holds no plugin manifest (`--plugin`) or no `SKILL.md` (`--default`), or lies outside the
    repository, such as an installed copy: error, and nothing is written. More than one of `--scope`, `--plugin`, and
    `--default`: usage error.

### UC9 — Select what a name builds on (A5.1)

- **Trigger:** a name is ambiguous, or a customizer wants to choose which plugins, or the default, a name builds on
  and in what order.
- **Entry points:** Skill: Load mode asks (UC4.2); otherwise the skill runs the command. Code:
  `reference select <name> <option>... [--scope user] [--clear]`.
- **Inputs:** a bare name; one or more options, bottom first, each a `<plugin>` or `default`; the tier written to
  (`project` by default, or `user`); the root.
- **Outcome:** `<name>.md` in that tier's folder holds an `extends` listing the options. An existing file keeps its
  body and other keys; only its `extends` changes. The name then resolves through that stack (K14), with managed,
  project, and user contributions applied over it in K17 order. A selection is a contribution, so `list` marks it and
  `--trace` explains it.
- **Extensions:**
  - UC9.1 A selected plugin is no longer installed: it is skipped with a warning (UC1.12). When every option is gone,
    the selection counts as not written and the stack falls through; a name left ambiguous is asked again (UC4.2).
  - UC9.2 An option that is neither `default` nor a plugin holding the name: error, and nothing is written.
  - UC9.3 The project and user folders select differently: the project's builds the stack; the user's is `not used`,
    with a warning (UC1.12).
  - UC9.4 A qualified name: error naming the bare name to use.
  - UC9.5 `--clear`: `extends` is removed from the file, and a file left with nothing in it is deleted. With no
    selection in that tier: error stating what answers the name now.

### UC11 — Remove a customization (A5.2)

- **Trigger:** a customizer wants a project or user contribution gone, or an author wants one gone from their plugin's
  or skill's source.
- **Entry points:** Skill: the `reference` skill's Delete mode. Code: `reference delete <name> [--scope user | --plugin
  <plugin folder> | --default <skill folder>] [--dry-run]`.
- **Inputs:** a bare name; where it is deleted from (the project tier by default, the user tier, or a plugin's or
  skill's source folder); the root.
- **Outcome:** `delete` removes only that file, and reports what answers the name afterwards: its status, and the stack
  with what built it. The status can be `ambiguous`, with the options, when the file held the selection that ordered
  the plugins.
- **Extensions:**
  - UC11.1 No contribution there: error stating what answers the name now. An installed plugin's, a managed, or an
    installed skill's contribution is never deleted.
  - UC11.2 A qualified name: error naming the bare name to use.
  - UC11.3 `--dry-run`: the path and the answer afterwards are printed, and nothing is deleted.
  - UC11.4 The file also holds a selection (`extends`): both go, and the report says the selection went too, naming
    `reference select` to restore it.
  - UC11.5 `--plugin <plugin folder>` or `--default <skill folder>`: deletes `<name>.md` or `<name>.default.md` there,
    under the folder checks of UC5.11.

## Criteria

Edge IDs are in [graph.md](./graph.md).

**Writing (UC5, UC9, UC11)**

- R24 (UC5, UC9, UC11, E26): `select` writes only `<name>.md`, in the root's `.agents/references/` (`project`, the
  default) or in `~/.agents/references/` (`user`, with `--scope user`). `create` and `delete` act there too, or on
  `<plugin folder>/references/<name>.md` with `--plugin <plugin folder>`, or on `<skill
  folder>/references/<name>.default.md` with `--default <skill folder>`; that folder must hold a plugin manifest or a
  `SKILL.md` and sit inside the repository. `--scope`, `--plugin`, and `--default` exclude each other (exit 2).
- R25 (UC5, UC9, UC11, E27): `create`, `select`, and `delete` reject a qualified name and say which bare name to use.
- R60 (UC5, E26): `create` never overwrites a file with a body. On a file holding only a selection, it adds the body
  and `merge` and keeps the `extends`.
- R26 (UC5, E28): `create` refuses when a `replace` or `remove` above would hide the new file, and names that
  contribution.
- R27 (UC5, E29): `create` writes `merge` from `--merge`, else the template's `merge`, else `patch`. `--implements`
  writes `merge: replace`. `--merge remove` writes no body, and fails with `--template`.
- R28 (UC5, E30): `create --implements <id>` writes the interface's sections as `##` headings in order and
  `implements: <id>@<version>`, each section stubbed `**Unsupported.**`; it fails for an unknown interface and with
  `--template`.
- R61 (UC9, E50): `select <name> <option>...` writes `extends` listing the options bottom first, leaving the body and
  other keys unchanged. An option that is neither `default` nor a plugin holding the name fails, and nothing is
  written.
- R62 (UC9, E51): `select --clear` removes `extends` and deletes a file left with nothing in it; with no selection in
  that tier, it fails stating what answers the name now.
- R30 (UC11, E32): `delete` removes only the file at the place chosen (R24), never a managed contribution or an
  installed copy, and reports the status and stack afterwards; when the file held a selection, the report says so and
  names `reference select`. With no file there, it fails stating what answers the name now.
- R29 (UC5, UC11, E31): `--dry-run` prints the path and the exact content (`create`) or the path and the answer
  afterwards (`delete`), and changes no file.
- R31 (UC5, E33): After a `create` write, the report gives the path and points to `show <name>` for the composed
  document; with `--trace`, the trace shows the new file `used`.
- R32 (UC5, E34): `create` refuses a template whose top level is a single heading holding the others (a title), and
  writes nothing; for a missing `description` it writes the file with a hint, not a warning.
