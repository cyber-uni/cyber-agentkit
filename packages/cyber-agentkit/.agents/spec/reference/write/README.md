---
spec-type: behavioral
---

# reference/write — contributions are created, customized, and removed without editing an installed plugin

Part of [reference](../README.md). Its What, key terms, actors, adapters, names, and output contract apply here;
IDs are shared across the parent and its children.

## Use Cases

### UC5 — Create a reference (A6.1, A6.2, A6.4)

- **Trigger:** an author creates a reference: a new name, a skill's default, an implementation of an interface (the
  owner's or another skill's), or an extension of an existing implementation. It goes into their plugin's or skill's
  source, or into the `repo` or `user` tier for a name the repository or the user owns. `create` can do anything
  `customize` (UC18) does, by hand.
- **Entry points:** Skill: the `reference` skill's Create and Update modes; Update edits the file, then checks the
  trace. Code: `reference create <name> [--scope repo|user | --plugin <plugin folder> | --default <skill folder>]
  [--merge <operation>] [--template <file> | --implements <id>] [--dry-run]`.
- **Inputs:** a bare name; where it is written (the `repo` tier by default, the `user` tier, or a plugin's or skill's
  source folder); the operation (default `patch`); a template or an interface; the root.
- **Outcome:** `create` writes `<name>.md` in that tier's folder with `merge: <operation>`, and reports the path with
  a hint that `load <name>` gives the resolved reference; with `--trace`, also the resulting trace, in which a `repo` or
  `user` file applies over the stack (K23). The skill shows the user where each section came from and offers the
  full document. A plugin file whose `extends` names another plugin records the version of that plugin it was written
  against, so `check` can warn its author when the base moves on (UC6).
- **Extensions:**
  - UC5.1 The file exists with a body: error, and nothing is written. `create` never overwrites; Update edits it.
  - UC5.2 The file holds only a selection: `create` adds the body and `merge`, and keeps its `extends`.
  - UC5.3 A qualified name: error naming the bare name to use.
  - UC5.4 A contribution that would hide the new file (a managed `replace` or `remove`, or, for a plugin file, one
    above it in the stack): error naming that contribution. A `user` file while this repository's `repo` tier holds
    the name: written, with a warning that the `repo` contribution is used in this repository (UC2.7).
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
  - UC5.12 A `--plugin` file that extends another plugin with `merge: replace`: error, and nothing is written. A copy
    would freeze every user on the base its author saw. The file states only the sections it changes, or, to replace
    the base entirely, is an implementation of its own with no `extends` on that plugin.

### UC18 — Customize a reference (A5.1, A8.1)

- **Trigger:** a customizer wants to change what a skill reads for a name, for the repository, for themselves, or for
  one project folder: by picking which plugins and sections it builds on, by saying in their own words what to change
  in the prose, or both.
- **Entry points:** Skill: the `reference` skill's Customize mode. It helps the customizer pick, runs the generator (a
  subagent on a low-cost model) when the prose must change, shows the draft, and writes it once they approve. Code:
  `reference customize <name> [--extends <step>...] [--request <file> --body <file>] [--scope repo|user | --in
  <folder>] [--merge <operation>] [--dry-run]`, which writes the file and its frontmatter; it runs no model.
- **Inputs:** a name; the target (the `repo` tier by default, the `user` tier, or a folder below the root); the picks,
  as UC9 gives them; the request (K22); the shape of a changed body (a delta by default, or a whole document with
  `--merge replace`); the root; the calling skill's folder, for the `default` tier.
- **Outcome:** what is written depends on what the customizer ended up changing. Picks alone write a selection
  (UC9). A request also writes a body: the generator reads the resolved reference from `load` with the picks applied,
  never the contribution files, and leaves the `user` tier out when the target is `repo` or a folder, so nothing
  personal reaches a shared file. It reads with managed contributions left out too, whatever the target, and writes
  none of their text, even when the harness shows an admin's instructions to the agent: they reach the agent only at
  load (K27). It writes one concise document that applies the request and keeps the stack's
  heading paths: by default a delta holding only the sections it changes, with `patch` or `combine`; with
  `--merge replace`, a whole document. For a folder, it is that folder's project section, stating only what differs
  there. The command records in the frontmatter the picks (`extends`), each source with its plugin's version (K21),
  and the request. A body goes stale as K26 says. A later `load` uses it as K23 says.
- **Extensions:**
  - UC18.1 The customizer declines the draft: nothing is written.
  - UC18.2 A request, and the target holds a body that records no request (written with `create` or by hand): error,
    and nothing is written, since customizing would replace it. A body that records a request is replaced.
  - UC18.3 The name resolves to nothing (`missing`): the body is written from the request alone, with no sources, as a
    whole document.
  - UC18.4 The name is `ambiguous`: the customizer picks first, then the request, if any, is applied.
  - UC18.5 A project section for a name that is not Markdown: error (UC1.17).
  - UC18.6 The command cannot run: the skill writes nothing and says so (UC4).
  - UC18.7 `--plugin` or `--default`: usage error. `customize` never writes a file that ships; an author uses
    `create` (UC5).
  - UC18.8 Neither picks nor a request: error.
  - UC18.9 Picks alone, and the target holds a body: the body is kept and only `extends` changes. A body that records a
    request was written against the old stack: the output suggests customizing again with that request.

### UC14 — Revise a stale generated document (A5.4, A7.2)

- **Trigger:** load reports a generated document stale (UC1.14) and Load passes that on (UC4.6), or a customizer wants
  a generated document brought up to date after updating plugins.
- **Entry points:** Skill: the `reference` skill's Customize mode, which reads the recorded picks and request from
  `load --trace` (UC2), runs the generator, shows the draft, and writes it once the customizer approves. Code:
  `reference customize <name> --request <file> --body <file>` with the same target; the command runs no model.
- **Inputs:** a name; the target that holds the stale document (`repo`, `user`, or a folder); its recorded picks and
  request.
- **Outcome:** the customizer revises without restating their request. The generator reads the resolved reference as
  UC18 does, with the recorded picks, and applies the recorded request to it. The draft replaces the stale document
  (UC18.2) and records the installed plugin versions, so load stops reporting it stale.
- **Extensions:**
  - UC14.1 The customizer declines the draft: nothing is written, and the document stays stale.
  - UC14.2 A recorded source is gone (its plugin was removed): the customizer is told before generating, and picks
    again (UC9) or goes on without it.
  - UC14.3 The customizer changes the request while revising: that is customizing again (UC18) with the new request.
  - UC14.4 A stale main document and stale project sections: the main document is revised first, then each project
    section, since each records the sources of the main document it was written against (K21).
  - UC14.5 No user is present: nothing is revised, and load keeps reporting it stale.
  - UC14.6 A non-Markdown document: regenerated whole, and its metadata file updated (UC13.7).
  - UC14.7 The command cannot run: nothing is written, and the skill says so (UC4.4).

### UC9 — Pick what a name builds on (A5.3)

- **Trigger:** a name is ambiguous, or a customizer wants to choose which plugins, or the default, a name builds on,
  in what order, and which of their sections.
- **Entry points:** Skill: Load mode asks (UC4.2), or Customize mode (UC18). Code: `reference customize <name>
  --extends <step>... [--scope repo|user]`.
- **Inputs:** a bare name; one or more steps, bottom first, each a `<plugin>` or `default`, optionally with the keys
  `merge`, `extends`, and `sections` (the top-level sections, by heading, that it contributes); the tier written to
  (`repo` by default, or `user`); the root.
- **Outcome:** `<name>.md` in that tier's folder holds an `extends` listing the steps. With no body, it is a selection
  (K16). The name then resolves through that stack (K14), as K23 says. A step with `sections` contributes only those
  sections, each with its operation; its other sections are not used. A selection is a contribution, so `list` marks
  it and `--trace` explains it.
- **Extensions:**
  - UC9.1 A picked plugin is no longer installed: it is skipped with a warning (UC1.12). When every step is gone, the
    selection counts as not written and the stack falls through; a name left ambiguous is asked again (UC4.2).
  - UC9.2 A step that is neither `default` nor a plugin holding the name: error, and nothing is written.
  - UC9.3 The `repo` and `user` tiers pick differently: the `repo` one builds the stack; the `user` one is
    `not used` (UC2.7).
  - UC9.4 A qualified name: error naming the bare name to use.
  - UC9.5 `--extends none`: `extends` is removed from the file, and a file left with nothing in it is deleted. With no
    `extends` in that tier: error stating what answers the name now. Removing the whole file is UC11.
  - UC9.6 A `sections` entry names a section the plugin's contribution does not hold: it is skipped with a warning.

### UC11 — Remove a customization (A5.2)

- **Trigger:** a customizer wants a `repo`, `user`, or project-folder contribution gone, or an author wants one gone
  from their plugin's or skill's source.
- **Entry points:** Skill: the `reference` skill's Delete mode. Code: `reference delete <name> [--scope repo|user | --in
  <folder> | --plugin <plugin folder> | --default <skill folder>] [--dry-run]`.
- **Inputs:** a bare name; where it is deleted from (the `repo` tier by default, the `user` tier, a folder's
  project section, or a plugin's or skill's source folder); the root.
- **Outcome:** `delete` removes only that file, and reports what answers the name afterwards: its status, and the stack
  with what built it. The status can be `ambiguous`, with the options, when the file held the selection that ordered
  the plugins.
- **Extensions:**
  - UC11.1 No contribution there: error stating what answers the name now. An installed plugin's, a managed, or an
    installed skill's contribution is never deleted.
  - UC11.2 A qualified name: error naming the bare name to use.
  - UC11.3 `--dry-run`: the path and the answer afterwards are printed, and nothing is deleted.
  - UC11.4 The file also holds a selection (`extends`): both go, and the report says the selection went too, naming
    `reference customize --extends` to restore it.
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
